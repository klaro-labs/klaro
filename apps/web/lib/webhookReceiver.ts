/**
 * Shared inbound-webhook receiver. Audit : three
 * receivers (erp/cctp/gateway) silently dropped `captureError` on signature
 * failure, so attackers probing with bad sigs left no trail. This helper
 * collapses all 5 receivers (stripe/circle/erp/cctp/gateway) to a single
 * path so observability + format defaults stay consistent.
 */
import { ok, err } from "./api";
import { verifyHmac, type VerifyOptions } from "./webhookVerify";
import { captureError } from "./sentry";

export interface WebhookReceiverOpts {
  /** Stable provider id — used in Sentry context + error code. */
  provider: "stripe" | "circle" | "cctp" | "gateway" | "erp";
  /** Header name carrying the signature. */
  headerName: string;
  /** Format of the header value. Defaults to `klaro` (stripe-style "t=,v1="). */
  format?: VerifyOptions["format"];
  /**
   * Resolved secret from env.ts. previously
   * `envVar: string` and `process.env[envVar]`, which bypassed the
   * env.ts audit boundary + the drift-guard test (string-keyed lookups
   * are invisible to static analysis). Callers now import the
   * resolved value from `@/lib/env` and pass it here.
   */
  secret: string | null | undefined;
  /** Optional payload handler — runs only on verified delivery. Default: no-op (the daemon picks up via a separate poller). */
  onVerified?: (
    payload: unknown,
    raw: string,
    req: Request,
  ) => Promise<void> | void;
}

export function makeWebhookReceiver(opts: WebhookReceiverOpts) {
  const secret = opts.secret;
  return async (req: Request): Promise<Response> => {
    if (!secret) return err(503, `${opts.provider}_secret_missing`);
    const raw = await req.text();
    // verifyHmac became async to support Redis-backed replay dedup.
    const verify = await verifyHmac({
      rawBody: raw,
      header: req.headers.get(opts.headerName) ?? "",
      secret,
      format: opts.format ?? "klaro",
    });
    if (!verify.ok) {
      // F-2 (web audit): previously returned `{ reason }` in
      // the 401 body — attacker probing without the secret got an
      // oracle distinguishing clock skew from sig mismatch from
      // replay. Iter-58 sanitized `handle()` for this exact leak;
      // receiver path was missed. Keep the reason in Sentry context
      // for ops triage; 401 body is just the public code.
      captureError(new Error(`${opts.provider} webhook ${verify.reason}`), {
        provider: opts.provider,
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
        verifyReason: verify.reason,
      });
      return err(401, "signature_invalid");
    }
    if (opts.onVerified) {
      try {
        const payload = raw ? JSON.parse(raw) : {};
        await opts.onVerified(payload, raw, req);
      } catch (e) {
        captureError(e, { provider: opts.provider, where: "onVerified" });
        return err(500, "handler_failed");
      }
    }
    return ok({ received: true, provider: opts.provider });
  };
}
