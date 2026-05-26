// Regression for loop (2026-05-25): `verifyPaymentHeader` must
// pick the requirements entry whose scheme matches the payload's signed
// scheme — not always `requirementsList[0]`. The previous behavior made
// the second advertised x402 payment scheme silently unusable: any payer
// signing `exact-onchain` would have it verified against the
// `exact-gateway-batched` requirements and the facilitator would reject
// on scheme mismatch.
// These tests cover only the mock path (no Circle facilitator call).
// The live path goes through `@circle-fin/x402-batching/server.verify`
// which we can't exercise without a real facilitator URL.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PaymentRequirements } from "@/lib/x402";

beforeEach(() => {
  vi.resetModules();
  delete process.env.X402_ENABLED; // mock mode
});

function reqs(): PaymentRequirements[] {
  return [
    {
      scheme: "exact-gateway-batched",
      network: "eip155:5042002",
      recipient: "0x" + "11".repeat(20),
      asset: "0x" + "22".repeat(20),
      maxAmountRequired: "100000",
      description: "test",
      resource: "klaro://test",
      facilitator: "https://facilitator.test",
    },
    {
      scheme: "exact-onchain",
      network: "eip155:5042002",
      recipient: "0x" + "11".repeat(20),
      asset: "0x" + "22".repeat(20),
      maxAmountRequired: "100000",
      description: "test",
      resource: "klaro://test",
      facilitator: "https://facilitator.test",
    },
  ];
}

function encode(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("verifyPaymentHeader scheme matching", () => {
  it("accepts a payload signed under the second advertised scheme", async () => {
    const { verifyPaymentHeader } = await import("@/lib/x402");
    const header = encode({
      x402Version: 1,
      scheme: "exact-onchain",
      accepted: { maxAmountRequired: "100000", scheme: "exact-onchain" },
      payload: { signature: "0xdead" },
    });
    const v = await verifyPaymentHeader(header, reqs());
    expect(v.ok).toBe(true);
    expect(v.mode).toBe("mock");
  });

  it("falls back to first scheme when payload omits its scheme", async () => {
    const { verifyPaymentHeader } = await import("@/lib/x402");
    const header = encode({
      x402Version: 1,
      accepted: { maxAmountRequired: "100000" },
      payload: { signature: "0xdead" },
    });
    const v = await verifyPaymentHeader(header, reqs());
    expect(v.ok).toBe(true);
  });

  it("backwards-compatible: still accepts a single PaymentRequirements arg", async () => {
    const { verifyPaymentHeader } = await import("@/lib/x402");
    const header = encode({
      x402Version: 1,
      accepted: { maxAmountRequired: "100000" },
      payload: { signature: "0xdead" },
    });
    const v = await verifyPaymentHeader(header, reqs()[0]);
    expect(v.ok).toBe(true);
  });

  it("rejects bad-base64 headers (negative path still works)", async () => {
    const { verifyPaymentHeader } = await import("@/lib/x402");
    const v = await verifyPaymentHeader("not-base64-{}", reqs());
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/base64/);
  });
});
