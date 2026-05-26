import { ok, err, publicErrorMessage } from "@/lib/api";
import { requireVendor } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";
import { WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME } from "@/lib/env";
import crypto from "node:crypto";

/** Generate registration options. Client uses these to call
 * `navigator.credentials.create`. The challenge is stored server-side so the
 * /verify route can confirm it. close the
 * client-helper → 404 path.
 * rpId was derived from
 * `req.url.hostname` while the verify route used WEBAUTHN_RP_ID env.
 * On Vercel preview URLs (and any setup where the request hostname
 * doesn't match the configured RP ID) every registration failed
 * attestation. Worse, on attacker-controlled hostnames (preview
 * takeover) passkeys would mint bound to a foreign RP. Both options
 * and verify routes now read the same env-pinned value. */
export async function POST(_req: Request) {
  try {
    const session = await requireVendor();
    const rpId = WEBAUTHN_RP_ID;
    const challenge = crypto.randomBytes(32).toString("base64url");

    const { error } = await serviceDb().from("webauthn_challenges").insert({
      challenge,
      vendor_id: session.vendor.id,
      kind: "register",
    });
    if (error) throw error;

    return ok({
      challenge,
      rp: { id: rpId, name: WEBAUTHN_RP_NAME },
      user: {
        id: Buffer.from(session.vendor.id).toString("base64url"),
        name: session.vendor.email,
        displayName: session.vendor.displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      timeout: 60_000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
  } catch (e) {
    captureError(e, { route: "webauthn.register.options" });
    return err(400, publicErrorMessage(e, "register_options_failed"));
  }
}
