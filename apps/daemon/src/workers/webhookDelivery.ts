/**
 * Outbound webhook delivery worker. Drains `webhook-deliver` queue.
 * HMAC-signs each delivery, retries with exponential backoff, DLQs after attempts.
 */
import crypto, { createHash } from "node:crypto";
import { DelayedError } from "bullmq";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { env } from "../env.js";
import { log } from "../log.js";
import { assertPublicHttpUrl } from "../safeFetchUrl.js";

/**
 * schema aligned with web's `WebhookEventSchema`. Was
 * 6 fields including a per-job `secret`; producer only passed 3, so
 * every field was undefined at the daemon and `deliveryIdempotencyKey`
 * collapsed to one key for all deliveries. Now: 5 fields, web producer
 * passes them all, and the HMAC secret is resolved from `env.WEBHOOK_HMAC_SECRET`
 * (per-webhook secret routing will be re-introduced in M11 when real
 * production producers land alongside a webhooks-table secret lookup).
 * NB: `payload` matches the producer's `data` field (renamed on
 * receive); `event` is the enum value; `url` is the destination.
 */
export interface WebhookJob {
  webhookId: string;
  eventId: string; // canonical event id — same value across retries
  event: string;
  data: Record<string, unknown>;
  url: string;
}

function sign(t: number, body: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
}

/** Audit finding #28 (2026-05-25): previous version used `job.id ?? ""` as the
 * idempotency key, which broke the unique constraint on
 * `webhook_deliveries(webhook_id, idempotency_key)` after the first delivery
 * (multiple retries collided on key=""). Now we derive a stable key from
 * `(webhookId, eventId)` so every retry of the same delivery hits the same
 * row, and distinct deliveries get distinct keys. */
export function deliveryIdempotencyKey(
  webhookId: string,
  eventId: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${webhookId}|${eventId}`)
    .digest("hex")
    .slice(0, 32);
}

export function startWebhookDelivery() {
  startWorker<WebhookJob>(
    "webhook-deliver",
    async (job) => {
      const { webhookId, eventId, event, data, url } = job.data;
      const idem = deliveryIdempotencyKey(webhookId, eventId);
      const t = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ event, eventId, data, sentAt: t });

      // was `if (!secret && !env.WEBHOOK_HMAC_SECRET)`
      // — the per-job secret was always undefined (producer didn't
      // send one), masking the bang-assert on env below. Now: just
      // env.WEBHOOK_HMAC_SECRET, fail-closed explicitly.
      if (!env.WEBHOOK_HMAC_SECRET) {
        // raw subscriber URL
        // may contain tenant tokens in path/query. Hash for log
        // retention; the webhookId alone is enough to look up the
        // full URL in the DB if an operator needs to investigate.
        log.error("webhook.no_secret", {
          webhookId,
          urlHashPrefix: createHash("sha256")
            .update(url)
            .digest("hex")
            .slice(0, 16),
        });
        throw new Error("webhook secret missing — fail-closed");
      }

      // SSRF revalidation at fetch time. Web's
      // createWebhookAction () validates at store time
      // and web's deliver revalidates at fetch time, but THIS daemon
      // worker (the one that actually drains in prod — web worker
      // only runs with KLARO_RUN_QUEUE_WORKER=1, which is daemon-only)
      // had no SSRF guard at all. A subscriber URL whose DNS
      // A-record flips post-validation reached AWS IMDS / Redis /
      // RFC1918 from the daemon with a signed Klaro HMAC body.
      await assertPublicHttpUrl(url);
      // secret-from-env only (per-job secret removed
      // from schema; the bang-assert is safe because the if-block
      // above already threw when env.WEBHOOK_HMAC_SECRET is unset).
      const sig = sign(t, body, env.WEBHOOK_HMAC_SECRET);
      // outbound fetch had no
      // timeout. A subscriber whose URL hangs pinned a worker
      // concurrency slot until Node's default TCP timeout (minutes).
      // With BullMQ concurrency 8, eight bad subscribers stalled the
      // queue. 10s ceiling keeps the queue moving; retry policy in
      // lib/queue surfaces persistent failures to DLQ.
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "klaro-signature": `t=${t},v1=${sig}`,
          "klaro-event-id": eventId,
          "user-agent": "Klaro-Webhooks/0.1",
        },
        body,
        signal: AbortSignal.timeout(10_000),
        // SSRF: assertPublicHttpUrl validates `url`, but fetch follows redirects
        // by default — a subscriber returning 302 -> http://169.254.169.254/...
        // (or any private host) would have the redirect followed PAST the guard,
        // reaching AWS IMDS / Redis / RFC1918 with a signed Klaro body. Refuse
        // redirects entirely; webhook endpoints must be final URLs.
        redirect: "manual",
      });
      if (
        res.type === "opaqueredirect" ||
        (res.status >= 300 && res.status < 400)
      ) {
        throw new Error(
          `webhook ${url} attempted a redirect (${res.status || "opaque"}) — refused (SSRF guard)`,
        );
      }

      // Upsert (so first attempt creates the row, retries update it). Stable
      // idempotency_key per (webhookId, eventId) closes the dup-key crash.
      // audit row upsert was swallowed. A failed write
      // left no audit trail of the delivery attempt, and the worker
      // would still throw below on non-2xx → BullMQ retried even on
      // a 2xx with a failed audit write (since the absence of the row
      // makes the dedup ineffective on the next attempt).
      // previously the upsert omitted `payload_json`,
      // but the schema declares it `not null` (migration 0005:61).
      // On the first attempt the upsert INSERT branch raised a NOT
      // NULL violation, which threw here → BullMQ retried 5× all
      // failing the same way → DLQ. Every outbound webhook delivery
      // dropped silently in prod. Re-uses the same payload object
      // already signed into `body` so the audit row carries exactly
      // what the receiver got.
      // (daemon audit): previously discarded the response
      // body — `last_error: "HTTP 4xx"` alone can't tell an operator
      // whether the subscriber rejected the signature, was rate-
      // limited, or hit a real bug. Capture up to 1KB of the body so
      // triage is possible. Length cap prevents log poisoning.
      const errBody = res.ok ? null : (await res.text()).slice(0, 1024);
      const upDelivery = await sb()
        .from("webhook_deliveries")
        .upsert(
          {
            webhook_id: webhookId,
            idempotency_key: idem,
            event: event,
            payload_json: { event, eventId, data, sentAt: t },
            status: res.ok ? "success" : "failed",
            attempts: job.attemptsMade + 1,
            last_error: res.ok ? null : `HTTP ${res.status}: ${errBody}`,
            last_attempt_at: new Date().toISOString(),
            delivered_at: res.ok ? new Date().toISOString() : null,
          },
          { onConflict: "webhook_id,idempotency_key" },
        );
      if (upDelivery.error) throw upDelivery.error;

      // (daemon audit): honor 429 Retry-After. Without this,
      // the worker threw immediately on rate-limit → BullMQ's default
      // exponential backoff fired the next attempt 5s later regardless
      // of what the subscriber asked for → polite subscribers got
      // punished + cycled through 5 attempts in <2 min → DLQ. Re-schedule
      // via BullMQ's `moveToDelayed` when Retry-After parses cleanly.
      // (audit convergence): plain `throw new Error()` after
      // `moveToDelayed` caused BullMQ to ALSO record a failed attempt
      // (contested state → duplicate delayed job OR premature DLQ).
      // Must throw `DelayedError` so BullMQ recognizes the move-out-
      // of-active and skips the failure path. Pass `job.token` per
      // BullMQ ≥4 requirement.
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const retryAfterMs = parseRetryAfter(retryAfter);
        if (retryAfterMs && retryAfterMs > 0) {
          await job.moveToDelayed(Date.now() + retryAfterMs, job.token);
          log.info("webhook.delivery.delayed_by_retry_after", {
            url,
            retryAfterMs,
          });
          throw new DelayedError();
        }
      }

      if (!res.ok) throw new Error(`webhook ${url} responded ${res.status}`);
    },
    8,
  );
}

// parse Retry-After per RFC 7231 — either delta-seconds
// (a non-negative integer) or an HTTP-date. Cap at 1h so a misbehaving
// subscriber can't pin a job slot indefinitely.
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const RETRY_MAX_MS = 60 * 60 * 1000;
  const secs = Number(header);
  if (Number.isInteger(secs) && secs >= 0) {
    return Math.min(secs * 1000, RETRY_MAX_MS);
  }
  const ts = Date.parse(header);
  if (!Number.isNaN(ts)) {
    const ms = ts - Date.now();
    return ms > 0 ? Math.min(ms, RETRY_MAX_MS) : null;
  }
  return null;
}
