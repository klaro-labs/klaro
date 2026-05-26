import crypto from "node:crypto";
import { z } from "zod";

import { createQueue } from "./queue";
import { WEBHOOK_HMAC_SECRET } from "./env";
import { captureError } from "./sentry";
import { assertPublicHttpUrl } from "./safeFetchUrl";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Outbound webhook delivery. v2 §35A + #23.
 * Stripe-compatible signature header:
 * Klaro-Signature: t=<unix>,v1=<hex sha256 hmac>
 * Subscribers verify by recomputing HMAC over `${t}.${rawBody}` and
 * constant-time-comparing. Body is the JSON payload as a string — sign
 * the exact bytes to dodge JSON-normalization mismatches.
 */

/// producer schema previously had `{url, event, data}`
/// (3 fields) while daemon's `WebhookJob` destructured `{webhookId,
/// eventId, event, payload, url, secret}` (6 fields). webhookId +
/// eventId were undefined at the daemon → `deliveryIdempotencyKey`
/// hashed `undefined|undefined` and collapsed every delivery row to
/// one upsert key; daemon's `secret` was undefined too, masking the
/// bang-assert on `env.WEBHOOK_HMAC_SECRET!`. Currently only
/// `sendTestPing` enqueues so the broken state was untriggered, but
/// would silently corrupt `webhook_deliveries` the moment any
/// production producer wired through. Aligned: producers pass
/// `webhookId` + `eventId` explicitly; daemon resolves the HMAC
/// secret from env (per-webhook secret routing would require a
/// design pass at M11 when real producers land).
export const WebhookEventSchema = z.object({
  webhookId: z.string().min(1),
  eventId: z.string().min(1),
  url: z.string().url(),
  event: z.enum([
    "invoice.created",
    "invoice.accepted",
    "invoice.paid",
    "invoice.settled",
    "invoice.cancelled",
    "cashout.requested",
    "cashout.released",
    "cashout.disputed",
    "refund.executed",
  ]),
  data: z.record(z.unknown()),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

function sign(t: number, body: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
}

async function deliver(payload: WebhookEvent): Promise<void> {
  // prod with no secret used to ship the literal
  // string "mock" as v1. That looked like a bug to subscribers (rejected)
  // but the real risk is that it normalized "absent secret in production" —
  // fail-closed here so misconfig surfaces during deploy, not in the field.
  if (IS_PROD && !WEBHOOK_HMAC_SECRET) {
    throw new Error("WEBHOOK_HMAC_SECRET required in production");
  }
  // revalidate URL at fetch time — store-time check (in
  // createWebhookAction) catches obvious internal targets, but DNS
  // rebinding could flip a legitimate-looking host to a private IP
  // between store + fetch. Belt-and-braces.
  await assertPublicHttpUrl(payload.url);
  const t = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event: payload.event,
    data: payload.data,
    sentAt: t,
  });
  const sig = WEBHOOK_HMAC_SECRET
    ? sign(t, body, WEBHOOK_HMAC_SECRET)
    : `mock-${t}`; // dev-only; the `mock-` prefix lets dev subscribers detect-and-skip
  const res = await fetch(payload.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "klaro-signature": `t=${t},v1=${sig}`,
      "user-agent": "Klaro-Webhooks/0.1",
    },
    body,
  });
  if (!res.ok) {
    // Throwing here flips BullMQ's retry-with-exponential-backoff on.
    throw new Error(`webhook ${payload.url} responded ${res.status}`);
  }
}

export const webhookQueue = createQueue<WebhookEvent>(
  "webhook-deliver",
  async (raw) => {
    const event = WebhookEventSchema.parse(raw);
    await deliver(event);
  },
);

/** Used by the /vendor/integrations/webhooks UI to send a test ping.
 * web P2 (audit ): now takes vendorId so the
 * webhookId is per-tenant. Was hardcoded `"test-ping"` — two vendors
 * test-pinging the same URL in the same minute collided on
 * `deliveryIdempotencyKey("test-ping", "test:url:minute")` and only
 * one row landed in webhook_deliveries. Test-ping is low-stakes but
 * the collision is cross-tenant interference. */
export async function sendTestPing(
  url: string,
  vendorId: string,
): Promise<{
  ok: boolean;
  jobId: string;
  mode: "queued" | "inline";
  error?: string;
}> {
  try {
    // pass webhookId + eventId so daemon's
    // deliveryIdempotencyKey collapses correctly across retries
    // (without these, every test ping hashed the same key and
    // corrupted webhook_deliveries).
    const minute = Math.floor(Date.now() / 60_000);
    const eventId = `test:${vendorId}:${url}:${minute}`;
    const res = await webhookQueue.enqueue(
      {
        webhookId: `test-ping:${vendorId}`,
        eventId,
        url,
        event: "invoice.created",
        data: { id: "test_ping", message: "Hello from Klaro" },
      },
      { idempotencyKey: eventId },
    );
    return { ok: true, ...res };
  } catch (e) {
    captureError(e, { where: "webhooks.sendTestPing", url });
    return {
      ok: false,
      jobId: "",
      mode: "inline",
      error: (e as Error).message,
    };
  }
}
