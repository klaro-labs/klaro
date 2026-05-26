import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function freshRequirePayment() {
  vi.resetModules();
  const mod = await import("@/lib/x402");
  return mod.requirePayment;
}

const SAVED: Record<string, string | undefined> = {};
beforeEach(() => {
  SAVED.X402_ENABLED = process.env.X402_ENABLED;
  SAVED.KLARO_FEE_RECEIVER = process.env.NEXT_PUBLIC_KLARO_FEE_RECEIVER;
});
afterEach(() => {
  process.env.X402_ENABLED = SAVED.X402_ENABLED ?? "";
  process.env.NEXT_PUBLIC_KLARO_FEE_RECEIVER = SAVED.KLARO_FEE_RECEIVER ?? "";
});

describe("x402.requirePayment fee-receiver guard", () => {
  it("returns 503 in live mode when KLARO_FEE_RECEIVER unset", async () => {
    process.env.X402_ENABLED = "1";
    delete process.env.NEXT_PUBLIC_KLARO_FEE_RECEIVER;
    const fn = await freshRequirePayment();
    const r = await fn(new Request("https://x/", { method: "POST" }), {
      priceUsdc: 1_000_000n,
      resource: "klaro://test",
      description: "test",
    });
    expect((r as Response).status).toBe(503);
  });

  it("allows mock mode without fee receiver (no live fund movement)", async () => {
    process.env.X402_ENABLED = "";
    delete process.env.NEXT_PUBLIC_KLARO_FEE_RECEIVER;
    const fn = await freshRequirePayment();
    const r = await fn(new Request("https://x/", { method: "POST" }), {
      priceUsdc: 1_000_000n,
      resource: "klaro://test",
      description: "test",
    });
    // No signature → 402, not 503.
    expect((r as Response).status).toBe(402);
  });
});
