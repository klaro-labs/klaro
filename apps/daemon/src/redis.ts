/**
 * Shared IORedis connection for BullMQ queues + idempotency cache.
 * BullMQ requires `maxRetriesPerRequest: null` per its docs:
 * https://docs.bullmq.io/bull/patterns/lifecycle#using-ioredis-with-bullmq
 */
import IORedis, { type Redis } from "ioredis";
import { env } from "./env.js";

let _r: Redis | null = null;
export function redis(): Redis {
  if (_r) return _r;
  _r = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  // (daemon audit): register `incrAndExpire` as a custom
  // atomic command so the retry counter's increment + TTL
  // refresh happen in a single Redis round-trip. Iter-95 F5 made the
  // TTL refresh unconditional but it was still a separate call — a
  // daemon SIGKILL between the two could leave the counter with
  // TTL=-1 (orphaned forever). One Lua script eliminates that window.
  // (daemon audit): EXPIRE uses NX flag so the TTL is set
  // only when no TTL exists. Iter-97's unconditional refresh let a
  // counter live forever under sustained-fail conditions (each release
  // re-set the 90s window). With NX, TTL is set on first INCR and
  // counter ages out naturally so dead Redis memory is bounded.
  _r.defineCommand("incrAndExpire", {
    numberOfKeys: 1,
    lua: "local v = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX'); return v",
  });
  return _r;
}

// TS doesn't know about the dynamically-defined `incrAndExpire`
// method; declare it via a typed wrapper so call sites stay clean.
interface RedisWithCustom extends Redis {
  incrAndExpire(key: string, ttlSeconds: number): Promise<number>;
}

/// Atomic "did I just claim this for the first time?" — returns true on
/// the FIRST call within `ttlSeconds`, false on every subsequent call.
/// Used by event listeners + workers so retries + multi-instance are
/// idempotent: `if (!(await claimOnce(key))) continue;` skips duplicates.
/// renamed from `seenOnce` to
/// `claimOnce` because the web's `lib/seenOnce.ts` exports a function
/// with the OPPOSITE return semantic (true = "already seen", false =
/// "first time"). Same name + opposite booleans was a copy-paste
/// footgun across the two surfaces. `claimOnce` here matches the
/// imperative "I claim this; was I first?" semantic of `SET NX EX`'s
/// "OK" return; the web's `seenOnce` keeps its declarative "was this
/// seen before?" semantic.
export async function claimOnce(
  key: string,
  ttlSeconds = 86_400,
): Promise<boolean> {
  const res = await redis().set(
    `klaro:idem:${key}`,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  );
  return res === "OK";
}

/// release a claim taken by `claimOnce` so the next watch
/// poll can re-process the event. Required when the post-claim handler
/// throws — without this, `safeEvent` swallows the error AND the claim
/// stays held for `ttlSeconds`, dropping the event forever (viem's
/// `watchEvent` resumes from `latest`, not the failed log).
export async function releaseClaim(key: string): Promise<void> {
  await redis().del(`klaro:idem:${key}`);
}

/// (daemon audit): bounded release. Iter-88 D88-3's
/// unconditional release created a retry storm during sustained
/// dependency outages — every viem poll re-fired the same event into
/// the same failing dependency with no backoff. Now: increment a
/// per-key retry counter, release only while count < maxRetries,
/// otherwise keep the claim held until its TTL so the next poll
/// skips. Caller (safeEvent) then enqueues a notify-admin so a human
/// can replay the held event once the dependency recovers.
/// Returns the post-increment count so the caller can decide whether
/// to enqueue an admin escalation on the threshold-crossing call.
export async function releaseClaimBounded(
  key: string,
  maxRetries = 5,
): Promise<{ released: boolean; retryCount: number }> {
  const counterKey = `klaro:idem:retries:${key}`;
  const r = redis() as RedisWithCustom;
  // single-round-trip atomic INCR + EXPIRE via the custom
  // command registered at connection time. Eliminates the SIGKILL race
  // window that narrowed but couldn't fully close.
  // Retry counter outlives the claim by 1h so a slow-recovery cycle
  // doesn't reset to 0 the moment the claim TTL expires.
  const next = await r.incrAndExpire(counterKey, 90_000);
  if (next > maxRetries) {
    return { released: false, retryCount: next };
  }
  await r.del(`klaro:idem:${key}`);
  return { released: true, retryCount: next };
}

/// clear the per-key retry counter once the handler
/// succeeds — a recovered service starts fresh on the NEXT event for
/// the same key (rare, since keys include txHash:logIndex, but
/// hygiene). No-op if no counter exists.
export async function clearRetryCounter(key: string): Promise<void> {
  await redis().del(`klaro:idem:retries:${key}`);
}
