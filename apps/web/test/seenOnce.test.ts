// Regression for loop (2026-05-25): the seenOnce primitive must
// correctly dedup on first-vs-subsequent within TTL, AND must honor TTL
// expiry so a legitimate retry after TTL is allowed. Tests the in-process
// fallback path (REDIS_URL unset); Redis path is covered by integration
// when REDIS_URL is set at runtime.

import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  // Force in-process fallback for these tests.
  vi.stubEnv("REDIS_URL", "");
});

describe("seenOnce — in-process fallback", () => {
  it("first call returns false (new), second returns true (seen)", async () => {
    const { seenOnce } = await import("@/lib/seenOnce");
    const first = await seenOnce("key-1", 60);
    const second = await seenOnce("key-1", 60);
    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  it("different keys are independent", async () => {
    const { seenOnce } = await import("@/lib/seenOnce");
    expect(await seenOnce("key-a", 60)).toBe(false);
    expect(await seenOnce("key-b", 60)).toBe(false);
    expect(await seenOnce("key-a", 60)).toBe(true);
    expect(await seenOnce("key-b", 60)).toBe(true);
  });

  it("expires after TTL — replay AFTER ttl seconds is treated as fresh", async () => {
    vi.useFakeTimers();
    try {
      const { seenOnce } = await import("@/lib/seenOnce");
      expect(await seenOnce("ttl-test", 1)).toBe(false);
      expect(await seenOnce("ttl-test", 1)).toBe(true);
      // Move past TTL
      vi.advanceTimersByTime(2_000);
      // Next call must treat the key as new (TTL elapsed)
      expect(await seenOnce("ttl-test", 1)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
