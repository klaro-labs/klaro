/**
 * BullMQ + Upstash adapter with synchronous-inline fallback.
 * Two modes:
 * - LIVE (REDIS_URL set): enqueue → BullMQ → worker process drains
 * - MOCK (REDIS_URL unset): enqueue executes handler inline + returns
 * `mode: "inline"` so the UI can surface a
 * "Simulated · queue not configured" badge.
 * Job-level retry/backoff/idempotency configured here once, inherited by
 * every queue Klaro creates ( — boring infra mandatory).
 */
import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis, { type Redis } from "ioredis";
// eslint-disable referenced a rule
// from the @typescript-eslint plugin which isn't loaded by next/core-web-
// vitals — caused `pnpm lint` to error. Removed the disable; no `any`
// usage actually needs it in this file (BullMQ generics handle the typing).
import { REDIS_URL, BULLMQ_PREFIX, queueLive } from "./env";

export type QueueMode = "queued" | "inline";

export interface QueueEnqueueResult {
  jobId: string;
  mode: QueueMode;
}

export interface KlaroQueue<T> {
  name: string;
  enqueue(
    payload: T,
    opts?: { idempotencyKey?: string },
  ): Promise<QueueEnqueueResult>;
  close(): Promise<void>;
}

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 7 * 86_400 },
};

// In-process idempotency cache for mock mode. 1-hour sliding window.
const seenInline = new Map<string, number>();
const INLINE_TTL_MS = 60 * 60 * 1000;
function inlineSeen(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of seenInline)
    if (now - t > INLINE_TTL_MS) seenInline.delete(k);
  if (seenInline.has(key)) return true;
  seenInline.set(key, now);
  return false;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  if (!REDIS_URL)
    throw new Error("queue.ts: redis() called but REDIS_URL not set");
  _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return _redis;
}

/** Set in apps/daemon (long-lived process) or in `next dev` to actually
 * drain queues. Web (Vercel serverless) leaves this unset — handlers run in
 * the daemon's process. previously the handler
 * closure was never registered with a Worker in live mode, so enqueued jobs
 * sat in Redis with no drainer.
 * read via env.ts so a typo (`KLARO_RUN_QUEUE_WORKERS`)
 * doesn't silently leave jobs undrained. Same env-bypass class as W83-1/2. */
import { KLARO_RUN_QUEUE_WORKER } from "./env";
const RUN_WORKER = KLARO_RUN_QUEUE_WORKER === "1";

export function createQueue<T>(
  name: string,
  handler: (payload: T) => Promise<void>,
): KlaroQueue<T> {
  let _q: Queue | null = null;
  let _w: Worker | null = null;
  const q = (): Queue => {
    if (_q) return _q;
    _q = new Queue(name, { connection: redis(), prefix: BULLMQ_PREFIX });
    if (RUN_WORKER && !_w) {
      _w = new Worker(name, async (job) => handler(job.data as T), {
        connection: redis(),
        prefix: BULLMQ_PREFIX,
        concurrency: 4,
      });
      _w.on("failed", (job, err) => {
        console.error(`[queue:${name}] job ${job?.id} failed:`, err.message);
      });
    }
    return _q;
  };

  return {
    name,
    async enqueue(payload, opts) {
      const idem = opts?.idempotencyKey;
      if (!queueLive()) {
        if (idem && inlineSeen(`${name}:${idem}`)) {
          return { jobId: idem, mode: "inline" };
        }
        await handler(payload);
        return { jobId: idem ?? crypto.randomUUID(), mode: "inline" };
      }
      // Generic BullMQ payloads — runtime validation happens in the worker
      // (zod schema in each queue's own file).
      const job = await q().add(name, payload as any, {
        ...DEFAULT_JOB_OPTS,
        jobId: idem,
      });
      return { jobId: job.id ?? crypto.randomUUID(), mode: "queued" };
    },
    async close() {
      if (_w) await _w.close();
      if (_q) await _q.close();
    },
  };
}

/** Cleanup helper for Next.js HMR — avoids leaking redis connections. */
export async function shutdownQueues(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
