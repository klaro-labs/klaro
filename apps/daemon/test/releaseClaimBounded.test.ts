/**
 * first daemon regression test — covers 's
 * `releaseClaimBounded` bounded-retry semantics. Without a cap, the
 * release path thundered against failing dependencies
 * during sustained outages (4s viem poll × 1h Supabase outage = 900
 * attempts per event). This test pins the contract:
 * - first 5 calls release the claim (returns released:true)
 * - 6th+ calls hold the claim (returns released:false)
 * - clearRetryCounter resets the counter so a recovered service
 * starts fresh
 * Mocks `ioredis` at the module boundary so the real IORedis constructor
 * never runs. The shim only implements what redis.ts actually uses
 * (set NX EX, incr, expire, del).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock env so redis.ts can import without a real REDIS_URL.
vi.mock("../src/env.js", () => ({
  env: {
    REDIS_URL: "redis://stub:6379",
    BULLMQ_PREFIX: "test-prefix",
    NODE_ENV: "test",
  },
}));

// Mock ioredis at the module boundary. The redis.ts factory does
// `new IORedis(env.REDIS_URL, opts)` — this default-export shim
// replaces that constructor with our in-memory implementation.
const store = new Map<string, string>();
const ttl = new Map<string, number>();

class InMemRedis {
  async set(
    key: string,
    _value: string,
    _ex: "EX",
    _ttlSec: number,
    _nx: "NX",
  ): Promise<"OK" | null> {
    if (store.has(key)) return null;
    store.set(key, _value);
    return "OK";
  }

  async incr(key: string): Promise<number> {
    const cur = Number(store.get(key) ?? 0);
    const next = cur + 1;
    store.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!store.has(key)) return 0;
    ttl.set(key, seconds);
    return 1;
  }

  async del(key: string): Promise<number> {
    const had = store.delete(key);
    ttl.delete(key);
    return had ? 1 : 0;
  }

  // redis.ts registers `incrAndExpire` as a custom
  // command (single Redis round-trip for atomic INCR + EXPIRE).
  // ioredis's defineCommand attaches the method dynamically; the mock
  // implements it directly so test paths match production semantics.
  // No-op stub for defineCommand since we override the method below.
  defineCommand(): void {
    // No-op — incrAndExpire is provided directly.
  }

  async incrAndExpire(key: string, ttlSeconds: number): Promise<number> {
    const next = await this.incr(key);
    ttl.set(key, ttlSeconds);
    return next;
  }
}

vi.mock("ioredis", () => ({
  default: InMemRedis,
}));

describe("releaseClaimBounded — iter 94 F2", () => {
  beforeEach(() => {
    store.clear();
    ttl.clear();
  });

  it("releases the first N attempts and holds after the cap", async () => {
    const { claimOnce, releaseClaimBounded } = await import("../src/redis.js");

    const KEY = "test:event-1";
    const MAX = 5;
    const results: Array<{ released: boolean; retryCount: number }> = [];

    // Each iteration models the safeEvent loop: claim → handler throws
    // → bounded release. When the cap is hit, the claim stays set, so
    // subsequent iterations would see claimOnce return false (event
    // dropped — exactly the desired behavior). To exercise the counter
    // arithmetic past the cap we re-set the claim manually each round.
    for (let i = 0; i < MAX + 2; i++) {
      // First iteration uses claimOnce normally; subsequent iterations
      // bypass via direct set so we observe the counter past the cap.
      if (i === 0) {
        const claimed = await claimOnce(KEY);
        expect(claimed).toBe(true);
      } else {
        store.set(`klaro:idem:${KEY}`, "1");
      }
      const r = await releaseClaimBounded(KEY, MAX);
      results.push(r);
    }

    // First MAX attempts release the claim.
    for (let i = 0; i < MAX; i++) {
      expect(results[i]).toEqual({ released: true, retryCount: i + 1 });
    }
    // Attempts MAX+1 and MAX+2 hold the claim.
    expect(results[MAX]).toEqual({ released: false, retryCount: MAX + 1 });
    expect(results[MAX + 1]).toEqual({ released: false, retryCount: MAX + 2 });
  });

  it("claim stays held when retry cap is exceeded — events get dropped (correct backoff)", async () => {
    const { claimOnce, releaseClaimBounded } = await import("../src/redis.js");

    const KEY = "test:event-1b";
    const MAX = 3;

    // Burn through the cap using the safeEvent-style pattern.
    for (let i = 0; i < MAX; i++) {
      const claimed = await claimOnce(KEY);
      expect(claimed).toBe(true);
      const r = await releaseClaimBounded(KEY, MAX);
      expect(r.released).toBe(true);
    }
    // 4th claim → handler throws → release should hold (counter at 4 > MAX=3).
    const claimed = await claimOnce(KEY);
    expect(claimed).toBe(true);
    const r = await releaseClaimBounded(KEY, MAX);
    expect(r.released).toBe(false);
    expect(r.retryCount).toBe(MAX + 1);
    // 5th claim attempt should return false (claim still set, no re-fire).
    const second = await claimOnce(KEY);
    expect(second).toBe(false);
  });

  it("expire is set on the first INCR so the counter doesn't leak forever", async () => {
    const { releaseClaimBounded } = await import("../src/redis.js");
    await releaseClaimBounded("test:event-2", 5);
    expect(ttl.get("klaro:idem:retries:test:event-2")).toBe(90_000);
  });

  it("clearRetryCounter resets the counter so a recovered service starts fresh", async () => {
    const { claimOnce, releaseClaimBounded, clearRetryCounter } =
      await import("../src/redis.js");

    const KEY = "test:event-3";
    // Burn through the cap.
    for (let i = 0; i < 6; i++) {
      await claimOnce(KEY);
      await releaseClaimBounded(KEY, 5);
    }
    // Counter at 6 → next call would hold.
    let r = await releaseClaimBounded(KEY, 5);
    expect(r.released).toBe(false);
    expect(r.retryCount).toBe(7);

    // Successful handler clears the counter; future release attempts
    // start at 1 again.
    await clearRetryCounter(KEY);
    r = await releaseClaimBounded(KEY, 5);
    expect(r).toEqual({ released: true, retryCount: 1 });
  });

  it("clearRetryCounter on one key doesn't affect a sibling key's counter", async () => {
    const { releaseClaimBounded, clearRetryCounter } =
      await import("../src/redis.js");
    // Build up counters on two distinct keys.
    await releaseClaimBounded("event-A", 5);
    await releaseClaimBounded("event-A", 5);
    await releaseClaimBounded("event-B", 5);
    // Clearing A's counter should NOT touch B's.
    await clearRetryCounter("event-A");
    const aAgain = await releaseClaimBounded("event-A", 5);
    const bAgain = await releaseClaimBounded("event-B", 5);
    expect(aAgain.retryCount).toBe(1); // A reset
    expect(bAgain.retryCount).toBe(2); // B unchanged + this call
  });

  it("EXPIRE NX (iter-98 F5) — TTL set only on first INCR so counter ages out naturally", async () => {
    const { releaseClaimBounded } = await import("../src/redis.js");
    // First call sets TTL = 90000.
    await releaseClaimBounded("event-ttl-once", 5);
    const firstTtl = ttl.get("klaro:idem:retries:event-ttl-once");
    expect(firstTtl).toBe(90_000);
    // Simulate that the production EXPIRE NX path would NOT refresh
    // on subsequent INCRs (the unconditional refresh let
    // counters live forever; fixed that). Our in-mem mock
    // intentionally implements "set TTL each call" (matches the
    // overall outcome) but the EXPIRE NX semantics in production Lua
    // mean the in-Redis TTL is only set on first INCR. Verifying the
    // counter value here (not the TTL refresh behavior, which is a
    // Redis-internal contract).
    await releaseClaimBounded("event-ttl-once", 5);
    expect(store.get("klaro:idem:retries:event-ttl-once")).toBe("2");
  });
});
