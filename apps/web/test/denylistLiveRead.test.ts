// Regression for loop (2026-05-25): readDenylistEntries must
// (a) return source:simulated when COUNTERPARTY_REGISTRY_ADDRESS unset,
// (b) return source:error (not silent simulated) when getLogs crashes,
// (c) isCounterpartyLiveOnChain reflects env presence.

import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("readDenylistEntries — adapter behavior", () => {
  it("returns source:simulated when COUNTERPARTY_REGISTRY_ADDRESS unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS", "");
    const { readDenylistEntries } = await import("@/lib/arcClient");
    const r = await readDenylistEntries();
    expect(r.source).toBe("simulated");
    expect(r.entries).toEqual([]);
  });

  it("returns source:error when getLogs crashes (no silent degrade)", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS",
      "0x" + "00".repeat(20),
    );
    const { readDenylistEntries } = await import("@/lib/arcClient");
    const r = await readDenylistEntries();
    expect(r.source).toBe("error");
    expect(r.error).toBeDefined();
  });

  it("isCounterpartyLiveOnChain reflects env presence", async () => {
    vi.stubEnv("NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS", "");
    const { isCounterpartyLiveOnChain } = await import("@/lib/arcClient");
    expect(isCounterpartyLiveOnChain()).toBe(false);

    vi.resetModules();
    vi.stubEnv(
      "NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS",
      "0x" + "01".repeat(20),
    );
    const reloaded = await import("@/lib/arcClient");
    expect(reloaded.isCounterpartyLiveOnChain()).toBe(true);
  });
});
