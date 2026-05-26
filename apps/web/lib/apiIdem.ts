/**
 * Idempotency cache for API replay protection.
 * module previously stored
 * entries in a process-level `Map`, making `Idempotency-Key` a
 * per-replica fiction. Two retries hitting two Vercel edge nodes
 * each saw an empty cache → each wrote a fresh row → duplicate
 * disputes / cashouts / invoices. Same defect class closed
 * for webhook replay. Now backed by the same Redis-backed primitive
 * (`lib/seenOnce.ts`'s helpers) so `Idempotency-Key` is atomic
 * across replicas. Falls back to in-process when REDIS_URL is unset
 * (dev), with documented limitations.
 */
import { REDIS_URL } from "./env";

const PREFIX = "klaro:idem:";
const inProc = new Map<string, { body: string; expiresAt: number }>();
const IN_PROC_BUDGET = 10_000;

let _redis: import("ioredis").Redis | null = null;
async function redisClient(): Promise<import("ioredis").Redis | null> {
  if (!REDIS_URL) return null;
  if (_redis) return _redis;
  try {
    const IORedis = (await import("ioredis")).default;
    _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    return _redis;
  } catch {
    return null;
  }
}

export const redis = {
  async get(key: string): Promise<string | null> {
    const r = await redisClient();
    if (r) {
      const v = await r.get(`${PREFIX}${key}`);
      return v ?? null;
    }
    const hit = inProc.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      inProc.delete(key);
      return null;
    }
    return hit.body;
  },
  async set(key: string, body: string, ttlSeconds: number): Promise<void> {
    const r = await redisClient();
    if (r) {
      await r.set(`${PREFIX}${key}`, body, "EX", ttlSeconds);
      return;
    }
    inProc.set(key, { body, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (inProc.size > IN_PROC_BUDGET) {
      const oldest = [...inProc.entries()].sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt,
      )[0];
      if (oldest) inProc.delete(oldest[0]);
    }
  },
};
