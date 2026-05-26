import { ok, err, publicErrorMessage } from "@/lib/api";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";
import { WEBAUTHN_RP_ID, WEBAUTHN_EXPECTED_ORIGIN } from "@/lib/env";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { z } from "zod";

/**
 * Verify a passkey assertion.
 * previously this route did NOT
 * cryptographically verify `authenticatorData` + `signature` against the
 * stored public key. Any challenge holder could pass `simulated_signature_
 * verify: true` and receive `verified: true`. Now uses
 * `@simplewebauthn/server.verifyAuthenticationResponse` which:
 * - Recomputes the WebAuthn signature base over (authData || sha256(clientData))
 * - Verifies it against the stored credentialPublicKey
 * - Confirms the signature counter has advanced (replay protection)
 * - Validates origin + RP ID match expected values
 * - Throws if any check fails.
 */

type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";

const Body = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional(),
  }),
  type: z.literal("public-key").optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string; type?: string };
    if (!clientData.challenge) return err(400, "missing_challenge");
    if (clientData.type !== "webauthn.get") return err(400, "wrong_type");

    const { data: chal, error: chalErr } = await serviceDb()
      .from("webauthn_challenges")
      .select("vendor_id, expires_at")
      .eq("challenge", clientData.challenge)
      .eq("kind", "assert")
      .maybeSingle();
    if (chalErr) throw chalErr;
    if (!chal) return err(400, "challenge_not_found");
    if (new Date(chal.expires_at) < new Date())
      return err(400, "challenge_expired");

    const credentialIdBytes = Buffer.from(body.rawId, "base64url");
    const { data: cred } = await serviceDb()
      .from("webauthn_credentials")
      .select("vendor_id, counter, public_key, transports")
      .eq("credential_id", credentialIdBytes)
      .maybeSingle();
    if (!cred) return err(404, "credential_not_registered");

    if (chal.vendor_id && chal.vendor_id !== cred.vendor_id) {
      return err(403, "credential_vendor_mismatch");
    }

    const verification = await verifyAuthenticationResponse({
      response: {
        id: body.id,
        rawId: body.rawId,
        response: body.response,
        clientExtensionResults: body.clientExtensionResults ?? {},
        type: "public-key",
      },
      expectedChallenge: clientData.challenge,
      expectedOrigin: WEBAUTHN_EXPECTED_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      credential: {
        id: body.id,
        publicKey: new Uint8Array(cred.public_key as Buffer),
        counter: Number(cred.counter ?? 0),
        transports: cred.transports as
          | AuthenticatorTransportFuture[]
          | undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      captureError(new Error("webauthn.assert.signature_failed"), {
        route: "webauthn.assert.verify",
        vendorId: cred.vendor_id,
      });
      return err(401, "signature_invalid");
    }

    const newCounter = verification.authenticationInfo.newCounter;
    await serviceDb()
      .from("webauthn_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("credential_id", credentialIdBytes);
    await serviceDb()
      .from("webauthn_challenges")
      .delete()
      .eq("challenge", clientData.challenge);

    return ok({ verified: true, vendorId: cred.vendor_id });
  } catch (e) {
    captureError(e, { route: "webauthn.assert.verify" });
    return err(400, publicErrorMessage(e, "assert_verify_failed"));
  }
}
