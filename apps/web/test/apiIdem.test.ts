import { describe, it, expect } from "vitest";
import { redis } from "@/lib/apiIdem";

// regression for apiIdem fix. In tests REDIS_URL is unset,
// so the in-process fallback is exercised. Production behavior (Redis SET NX
// EX across replicas) is covered by lib/seenOnce.ts's existing tests; this
// suite locks the fallback contract so a future refactor can't quietly
// regress it back to a per-replica Map without TTL.

describe("apiIdem.redis (in-process fallback)", () => {
  it("returns null when key absent", async () => {
    expect(await redis.get(`unknown-${Date.now()}`)).toBeNull();
  });

  it("returns the cached body on subsequent get", async () => {
    const key = `it77-roundtrip-${Date.now()}`;
    await redis.set(key, JSON.stringify({ ok: true }), 60);
    expect(await redis.get(key)).toBe('{"ok":true}');
  });

  it("evicts after ttl elapses", async () => {
    const key = `it77-ttl-${Date.now()}`;
    await redis.set(key, "x", 0); // already past
    // give the wall clock a beat so expiresAt < Date.now() at read time
    await new Promise((r) => setTimeout(r, 5));
    expect(await redis.get(key)).toBeNull();
  });

  it("isolates keys between callers", async () => {
    const a = `it77-iso-a-${Date.now()}`;
    const b = `it77-iso-b-${Date.now()}`;
    await redis.set(a, "alpha", 60);
    await redis.set(b, "beta", 60);
    expect(await redis.get(a)).toBe("alpha");
    expect(await redis.get(b)).toBe("beta");
  });
});
