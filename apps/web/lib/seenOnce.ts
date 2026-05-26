/**
 * cross-serverless-instance dedup
 * primitive. Webhook replay protection in `lib/webhookVerify.ts` used an
 * in-process `Map<string, number>` which:
 * 1. Resets on every Vercel cold start — a replay attacker who waited
 * a few seconds past the function's idle window would always succeed.
 * 2. Lives in one isolated instance only — concurrent serverless
 * invocations on different nodes each had their own seen-set, so a
 * replay across two replicas always passed both.
 * Mirrors the daemon's `seenOnce` API (apps/daemon/src/redis.ts) so future
 * code can share the same mental model. When REDIS_URL is set, uses
 * Upstash REST (works from any serverless edge); otherwise falls back to
 * an in-process Map with documented limitations.
 */

import { REDIS_URL } from "./env";

const PREFIX = "klaro:seen:";
const inProc = new Map<string, number>();
const IN_PROC_TTL_BUDGET = 100_000;

let _redis: import("ioredis").Redis | null = null;
async function redis(): Promise<import("ioredis").Redis | null> {
  if (!REDIS_URL) return null;
  if (_redis) return _redis;
  try {
    const IORedis = (await import("ioredis")).default;
    _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    return _redis;
  } catch {
    // ioredis not available at runtime (e.g. edge runtime). Fall back to
    // in-process and let the caller observe degraded dedup.
    return null;
  }
}

/// Returns true if `key` has been seen within `ttlSeconds`; false if this
/// is the first time. Atomic on Redis (SET NX EX), best-effort in-process.
export async function seenOnce(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const r = await redis();
  if (r) {
    // SET NX EX = set if not exists with expiry. Returns "OK" on first set,
    // null on subsequent calls within TTL. Atomic across replicas.
    const res = await r.set(`${PREFIX}${key}`, "1", "EX", ttlSeconds, "NX");
    return res !== "OK";
  }
  // In-process fallback. Acceptable in dev / single-instance deploys.
  // Documented as "best effort" — production must set REDIS_URL.
  const now = Date.now();
  for (const [k, t] of inProc)
    if (now - t > ttlSeconds * 1000) inProc.delete(k);
  if (inProc.size > IN_PROC_TTL_BUDGET) {
    const oldest = [...inProc.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) inProc.delete(oldest[0]);
  }
  if (inProc.has(key)) return true;
  inProc.set(key, now);
  return false;
}
