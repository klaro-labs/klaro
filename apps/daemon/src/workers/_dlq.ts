/**
 * Dead-letter handler. Subscribes to every Queue's `failed` event AFTER all
 * attempts are exhausted, persists the job to `dead_letter_jobs` for operator
 * triage, and (when threshold exceeded) calls PagerDuty.
 * no DLQ existed previously; failed jobs sat
 * silently in BullMQ's internal `failed` set with no operator visibility.
 */
import { QueueEvents } from "bullmq";
import { redis } from "../redis.js";
import { sb } from "../db.js";
import { env } from "../env.js";
import { log } from "../log.js";
import { queue } from "../queue.js";

const PAGERDUTY_THRESHOLD = 10;
const POLL_INTERVAL_MS = 60_000;

const _subscribed = new Set<string>();
// (daemon audit): hold QueueEvents handles so shutdown can
// close them. Without this, the per-queue subscriptions kept their
// own Redis client open + continued firing `failed` callbacks during
// drain, racing closeAll. `persist()` then ran against a closing
// Queue → ECONNRESET log spam on every shutdown.
const _events = new Map<string, QueueEvents>();
let _pagerdutyCooldown = 0;
// previously `setInterval(checkBacklog)` returned a handle
// that was never stored or cleared. SIGTERM path called `closeAll()` then
// `process.exit(0)` — graceful drain was masked because the timer kept
// firing during shutdown. Now stored + cleared via `stopDlqWatch()`
// which `index.ts` calls during the shutdown handler.
let _backlogTimer: ReturnType<typeof setInterval> | null = null;
// (daemon audit): module-level AbortController so an
// in-flight PagerDuty fetch (10s timeout) is aborted on shutdown.
// Otherwise the body may not flush to PD before the socket closes —
// dropped page exactly during the incident the page was meant to
// announce.
let _shutdownController = new AbortController();

export function watchDlq(queueNames: string[]): void {
  for (const name of queueNames) {
    if (_subscribed.has(name)) continue;
    const ev = new QueueEvents(name, {
      connection: redis(),
      prefix: env.BULLMQ_PREFIX,
    });
    ev.on("failed", async ({ jobId, failedReason, prev }) => {
      // Only handle the FINAL failure (after all attempts exhausted).
      if (prev && prev !== "active") return;
      await persist(name, jobId, failedReason);
    });
    ev.on("error", (err) =>
      log.error("dlq.events.error", { queue: name, err: err.message }),
    );
    _subscribed.add(name);
    _events.set(name, ev);
    log.info("dlq.watch", { queue: name });
  }
  if (!_backlogTimer) {
    _backlogTimer = setInterval(checkBacklog, POLL_INTERVAL_MS);
  }
}

export async function stopDlqWatch(): Promise<void> {
  if (_backlogTimer) {
    clearInterval(_backlogTimer);
    _backlogTimer = null;
  }
  // close every QueueEvents before closeAll runs so the
  // per-queue Redis subscriptions don't fire callbacks against a
  // draining queue. allSettled — one close() throw shouldn't poison
  // the rest. Subscribed set + map are cleared so a subsequent
  // watchDlq() (e.g. test harness) starts fresh.
  const closes = [..._events.values()].map((e) => e.close());
  _events.clear();
  _subscribed.clear();
  // abort any in-flight PagerDuty fetch so the page either
  // flushes immediately or the fetch errors fast (no 10s dangle).
  _shutdownController.abort();
  _shutdownController = new AbortController(); // ready for a fresh boot
  await Promise.allSettled(closes);
}

async function persist(
  queueName: string,
  jobId: string | undefined,
  reason: string,
): Promise<void> {
  try {
    // previously `payload: {}` with a TODO comment.
    // Operators triaging a DLQ'd job saw no orderId/kind/payload, so
    // couldn't replay or root-cause. Now look up the real job data
    // via BullMQ's `Queue.getJob(jobId)`.
    let payload: unknown = {};
    if (jobId) {
      try {
        // (daemon audit): reuse the shared queue pool instead
        // of allocating a fresh Queue + Redis connections per failed job.
        // Under a DLQ storm (100 failed jobs/min during a Supabase
        // outage), the prior `new Queue + q.close()` churned hundreds of
        // Redis connections against a Redis that may also be under
        // pressure. `queue(name)` is the cached factory used by all
        // workers; getJob is read-only so the default-job-opts merge is
        // harmless.
        const job = await queue(queueName).getJob(jobId);
        if (job?.data) {
          payload = job.data;
        } else {
          // (daemon audit): job was swept by BullMQ
          // retention (removeOnFail age 7d) before the QueueEvents
          // `failed` event fired — rare edge case but possible under
          // clock skew or replica handoff. Record a marker so operator
          // knows the empty payload isn't a worker bug.
          payload = { _unrecoverable: "job_already_swept" };
          log.warn("dlq.payload.unrecoverable_swept", {
            queue: queueName,
            jobId,
          });
        }
      } catch (e) {
        log.warn("dlq.payload.lookup_failed", {
          queue: queueName,
          jobId,
          err: (e as Error).message,
        });
      }
    }
    const { error } = await sb()
      .from("dead_letter_jobs")
      .insert({
        queue_name: queueName,
        job_id: jobId ?? null,
        failed_reason: reason ?? "unknown",
        attempts_made: 5,
        payload,
      });
    if (error) throw error;
    log.warn("dlq.recorded", { queue: queueName, jobId, reason });
  } catch (e) {
    log.error("dlq.persist.failed", {
      queue: queueName,
      jobId,
      err: (e as Error).message,
    });
  }
}

async function checkBacklog(): Promise<void> {
  const { count, error } = await sb()
    .from("dead_letter_jobs")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);
  // previously `if (error) return;` silently muted the
  // PagerDuty fire-decision. This is the last-resort path between
  // "DLQ filling up" and "operator gets paged" () — a
  // transient Supabase failure here is exactly when ops needs to know.
  // hardened cron read paths but missed this one.
  if (error) {
    log.error("dlq.backlog_check_failed", { err: error.message });
    return;
  }
  if ((count ?? 0) >= PAGERDUTY_THRESHOLD) {
    // firePagerDuty is now async (Redis-lock + fetch).
    // Fire-and-forget so checkBacklog's poll stays on schedule.
    void firePagerDuty(count ?? 0);
  }
}

async function firePagerDuty(backlog: number): Promise<void> {
  const key = env.PAGERDUTY_INTEGRATION_KEY;
  if (!key) {
    log.warn("dlq.pagerduty.skipped", {
      backlog,
      reason: "PAGERDUTY_INTEGRATION_KEY unset",
    });
    return;
  }
  // (daemon audit): the prior per-process `_pagerdutyCooldown`
  // throttled each replica independently — N replicas = N wasted POSTs
  // to PD every 30 min (PD's dedup_key merges incidents but each POST
  // still hits the wire + taints PD analytics). Mirror the
  // Redis-lock pattern so the cooldown is cross-replica.
  const gotLock = await redis().set(
    "klaro:pd:dlq-backlog",
    "1",
    "EX",
    30 * 60,
    "NX",
  );
  if (gotLock !== "OK") return;
  // Keep the per-process counter too as a microsecond-fast bailout
  // before the Redis call on subsequent ticks in the SAME replica.
  const now = Date.now();
  if (now < _pagerdutyCooldown) return;
  _pagerdutyCooldown = now + 30 * 60_000;

  // same AbortSignal.timeout fix applied to
  // webhookDelivery. A hung PagerDuty endpoint during a real DLQ storm
  // (the worst possible moment to lose request handles) leaked handles
  // every poll interval. 10s ceiling keeps the watch loop healthy.
  void fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      routing_key: key,
      event_action: "trigger",
      // dedup_key collapses cross-replica + cross-cooldown
      // re-pages into one PagerDuty incident. Without it, N daemon
      // replicas all paged the on-call independently for the same
      // backlog event. PD's own dedup uses this key to merge.
      dedup_key: "klaro-daemon-dlq-backlog",
      payload: {
        summary: `Klaro daemon DLQ backlog: ${backlog} jobs`,
        severity: backlog > 100 ? "critical" : "warning",
        source: "klaro-daemon",
      },
    }),
    signal: AbortSignal.any([
      _shutdownController.signal,
      AbortSignal.timeout(10_000),
    ]),
  }).catch((e) =>
    log.error("dlq.pagerduty.failed", { err: (e as Error).message }),
  );
}
