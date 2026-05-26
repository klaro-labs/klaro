import { ok, err, publicErrorMessage } from "@/lib/api";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";
import { WEBAUTHN_RP_ID } from "@/lib/env";
import crypto from "node:crypto";
import { z } from "zod";

/** Get assertion options for passkey sign-in.
 * rpId env-pinned on both sides.
 * previously the response shape
 * changed based on whether `body.email` matched a registered vendor —
 * matched emails returned a populated `allowCredentials` array; unknown
 * emails returned `undefined`. An attacker could enumerate Klaro
 * accounts (and the exact base64url credential IDs registered to each)
 * by submitting candidate emails and observing the response shape.
 * Now: response shape is constant. `allowCredentials` is always
 * omitted; clients rely on the platform's discoverable-credential
 * selector instead. Email is dropped from the request schema entirely
 * — the verify route resolves the credential by its raw id, so the
 * options route never needs to know which vendor it's serving. */
const Body = z.object({}).optional();

export async function POST(req: Request) {
  try {
    Body.parse(await req.json().catch(() => ({})));
    const rpId = WEBAUTHN_RP_ID;
    const challenge = crypto.randomBytes(32).toString("base64url");

    // vendor_id stays null at challenge-issue time; the verify route
    // looks up vendor via `webauthn_credentials.credential_id` against
    // the resident-key the authenticator returns. Email enumeration
    // closed.
    const { error } = await serviceDb().from("webauthn_challenges").insert({
      challenge,
      vendor_id: null,
      kind: "assert",
    });
    if (error) throw error;

    return ok({
      challenge,
      rpId,
      timeout: 60_000,
      userVerification: "preferred",
    });
  } catch (e) {
    captureError(e, { route: "webauthn.assert.options" });
    return err(400, publicErrorMessage(e, "assert_options_failed"));
  }
}
