/**
 * regression tests for the `releaseClaim` legacy
 * primitive + the `claimOnce` SET-NX semantics. These are still
 * exported even though `safeEvent` now routes through the bounded
 * variant — anything else in the daemon that takes a one-shot claim
 * (future workers, cron handlers) relies on these contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/env.js", () => ({
  env: {
    REDIS_URL: "redis://stub:6379",
    BULLMQ_PREFIX: "test-prefix",
    NODE_ENV: "test",
  },
}));

const store = new Map<string, string>();
const ttl = new Map<string, number>();

class InMemRedis {
  async set(
    key: string,
    value: string,
    _ex: "EX",
    ttlSec: number,
    _nx: "NX",
  ): Promise<"OK" | null> {
    if (store.has(key)) return null;
    store.set(key, value);
    ttl.set(key, ttlSec);
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

  defineCommand(): void {
    // No-op — incrAndExpire is provided directly when needed.
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

describe("claimOnce — iter 70 SET NX EX semantics", () => {
  beforeEach(() => {
    store.clear();
    ttl.clear();
  });

  it("returns true on the first claim and false on subsequent claims within TTL", async () => {
    const { claimOnce } = await import("../src/redis.js");
    const KEY = "event:abc";
    expect(await claimOnce(KEY)).toBe(true);
    expect(await claimOnce(KEY)).toBe(false);
    expect(await claimOnce(KEY)).toBe(false);
  });

  it("namespaces with klaro:idem: prefix so unrelated keys don't collide", async () => {
    const { claimOnce } = await import("../src/redis.js");
    await claimOnce("a");
    // The internal key is namespaced; direct check of the prefix.
    expect(store.has("klaro:idem:a")).toBe(true);
    expect(store.has("a")).toBe(false);
  });

  it("respects the TTL argument by setting it on the underlying SET", async () => {
    const { claimOnce } = await import("../src/redis.js");
    await claimOnce("event:ttl-check", 3600);
    expect(ttl.get("klaro:idem:event:ttl-check")).toBe(3600);
  });
});

describe("releaseClaim — iter 88 D88-3 legacy primitive", () => {
  beforeEach(() => {
    store.clear();
    ttl.clear();
  });

  it("removes the claim so the next claimOnce returns true again", async () => {
    const { claimOnce, releaseClaim } = await import("../src/redis.js");
    const KEY = "event:release";
    expect(await claimOnce(KEY)).toBe(true);
    expect(await claimOnce(KEY)).toBe(false);
    await releaseClaim(KEY);
    expect(await claimOnce(KEY)).toBe(true);
  });

  it("is idempotent on a non-existent claim (no throw)", async () => {
    const { releaseClaim } = await import("../src/redis.js");
    await expect(releaseClaim("never-claimed")).resolves.toBeUndefined();
  });
});
