import { ok, err, publicErrorMessage } from "@/lib/api";
import { requireVendor } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";
import { WEBAUTHN_RP_ID, WEBAUTHN_EXPECTED_ORIGIN } from "@/lib/env";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { z } from "zod";

/**
 * Verify attestation + store credential.
 * previously stored the raw
 * attestationObject as the "public key" without parsing or verifying.
 * The downstream assert/verify route then "verified" against an
 * unparsed blob — meaning register was a no-op crypto-wise. Now
 * `verifyRegistrationResponse` parses the attestation, extracts the
 * COSE-encoded credentialPublicKey, and we store THAT for the assert
 * leg. Counter starts at the value the authenticator reported.
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
    attestationObject: z.string().min(1),
    transports: z.array(z.string()).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
    authenticatorData: z.string().optional(),
  }),
  type: z.literal("public-key").optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.string().optional().nullable(),
  deviceLabel: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireVendor();
    const body = Body.parse(await req.json());

    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    if (!clientData.challenge) return err(400, "missing_challenge");

    const { data: row, error: chalErr } = await serviceDb()
      .from("webauthn_challenges")
      .select("vendor_id, expires_at, kind")
      .eq("challenge", clientData.challenge)
      .eq("kind", "register")
      .maybeSingle();
    if (chalErr) throw chalErr;
    if (!row) return err(400, "challenge_not_found");
    if (row.vendor_id !== session.vendor.id)
      return err(403, "challenge_vendor_mismatch");
    if (new Date(row.expires_at) < new Date())
      return err(400, "challenge_expired");

    const verification = await verifyRegistrationResponse({
      response: {
        id: body.id,
        rawId: body.rawId,
        response: {
          ...body.response,
          transports: body.response.transports as
            | AuthenticatorTransportFuture[]
            | undefined,
        },
        clientExtensionResults: body.clientExtensionResults ?? {},
        type: "public-key",
      },
      expectedChallenge: clientData.challenge,
      expectedOrigin: WEBAUTHN_EXPECTED_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      captureError(new Error("webauthn.register.attestation_failed"), {
        route: "webauthn.register.verify",
        vendorId: session.vendor.id,
      });
      return err(401, "attestation_invalid");
    }

    const { credential } = verification.registrationInfo;
    const transports =
      (body.response.transports as
        | AuthenticatorTransportFuture[]
        | undefined) ?? null;

    const { error: insErr } = await serviceDb()
      .from("webauthn_credentials")
      // credential_id / public_key are `bytea`; codegen types them `string`.
      // Passkey registration is currently gated off — casts preserve the
      // existing path; validate the bytea hex round-trip when passkeys ship.
      .insert({
        vendor_id: session.vendor.id,
        credential_id: Buffer.from(
          credential.id,
          "base64url",
        ) as unknown as string,
        public_key: Buffer.from(credential.publicKey) as unknown as string,
        counter: credential.counter,
        transports,
        device_label: body.deviceLabel ?? null,
      });
    if (insErr) throw insErr;

    await serviceDb()
      .from("webauthn_challenges")
      .delete()
      .eq("challenge", clientData.challenge);

    return ok({ registered: true });
  } catch (e) {
    captureError(e, { route: "webauthn.register.verify" });
    return err(400, publicErrorMessage(e, "register_verify_failed"));
  }
}
