/**
 * Queue + Worker factory. Each worker process gets one of these per queue name.
 * Job options: 5 attempts, exponential 5s backoff, 24h retention for completed,
 * 7d retention for failed. Failures that exhaust attempts auto-promote to the
 * dead-letter queue via the `failed` handler in `workers/_dlq.ts`.
 */
import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { redis } from "./redis.js";
import { env } from "./env.js";
import { log } from "./log.js";

export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 7 * 86_400 },
};

const _queues = new Map<string, Queue>();
const _workers = new Map<string, Worker>();

/**
 * Returns a Queue whose `add()` ALWAYS merges DEFAULT_JOB_OPTS so callers
 * can't accidentally enqueue single-attempt jobs.
 * (2026-05-25): every prior `.add()` call site was using raw BullMQ defaults
 * (1 attempt, no backoff) because DEFAULT_JOB_OPTS was exported but never
 * passed. This wrapper closes the gap at the source — no change required
 * to any worker file.
 */
export function queue<T = unknown>(name: string): Queue<T> {
  const existing = _queues.get(name) as Queue<T> | undefined;
  if (existing) return existing;
  const q = new Queue<T>(name, {
    connection: redis(),
    prefix: env.BULLMQ_PREFIX,
  });
  // BullMQ types `Queue.add` against the queue's narrowed name union; coercion
  // here keeps the generic open while preserving the runtime-default merge.
  const originalAdd = q.add.bind(q) as unknown as (
    jn: string,
    d: T,
    o?: JobsOptions,
  ) => ReturnType<Queue<T>["add"]>;
  (
    q as unknown as { add: (jn: string, d: T, o?: JobsOptions) => unknown }
  ).add = (jobName: string, data: T, opts?: JobsOptions) =>
    originalAdd(jobName, data, { ...DEFAULT_JOB_OPTS, ...opts });
  _queues.set(name, q);
  return q;
}

export function startWorker<T = unknown>(
  name: string,
  processor: Processor<T>,
  concurrency = 4,
): Worker<T> {
  let w = _workers.get(name) as Worker<T> | undefined;
  if (w) return w;
  w = new Worker<T>(name, processor, {
    connection: redis(),
    prefix: env.BULLMQ_PREFIX,
    concurrency,
  });
  w.on("ready", () => log.info("worker.ready", { queue: name, concurrency }));
  w.on("failed", (job, err) =>
    log.error("worker.failed", {
      queue: name,
      jobId: job?.id,
      err: err?.message,
    }),
  );
  w.on("error", (err) =>
    log.error("worker.error", { queue: name, err: err.message }),
  );
  _workers.set(name, w);
  return w;
}

// (daemon audit): bounded worker close. `w.close()` blocks
// on in-flight jobs; a single mid-flight screenAndSettle awaits 2 RPC
// receipts (15s timeout × 2 + retries) — sequential closeAll could
// blow past Railway's 30s SIGTERM grace → SIGKILL → defeats
// drain. Cap each worker at 20s; force-close stragglers so the queue
// stage gets at least 10s of the grace window.
const WORKER_CLOSE_MS = 20_000;

async function closeWorkerBounded(w: Worker): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(async () => {
      try {
        await w.close(true); // force=true; abort in-flight
      } catch (e) {
        log.warn("worker.forceClose.failed", { err: (e as Error).message });
      }
      resolve();
    }, WORKER_CLOSE_MS);
  });
  try {
    await Promise.race([w.close(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function closeAll(): Promise<void> {
  // (daemon audit): close workers BEFORE queues. Workers'
  // in-flight processors enqueue follow-up jobs via `queue(...).add()`
  // (e.g. screenAndSettle → receipt-generate). Closing both
  // concurrently raced the worker's add() against its own Queue's
  // close → ECONNRESET log spam + lost follow-up jobs. Sequential
  // ensures the processor finishes its dependent enqueue before the
  // target Queue closes its Redis connection.
  // bounded per-worker close so closeAll fits in Railway's
  // 30s SIGTERM grace even when workers have long-running RPC jobs.
  await Promise.all(Array.from(_workers.values()).map(closeWorkerBounded));
  _workers.clear();
  await Promise.all(Array.from(_queues.values()).map((q) => q.close()));
  _queues.clear();
}
