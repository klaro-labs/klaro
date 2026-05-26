// Regression for loop (2026-05-25): simulatePaymentAction must
// fail loud whenever contracts are configured. The mock mutation path must
// never report a successful payment beside live onchain state.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Hex } from "@/lib/types";

const INVOICE_ID = ("0x" + "ab".repeat(32)) as Hex;
const BUYER = ("0x" + "cd".repeat(20)) as Hex;

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("simulatePaymentAction live-mode guard", () => {
  it("throws when NODE_ENV=production AND NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS", "0x" + "01".repeat(20));
    const { simulatePaymentAction } = await import("@/app/i/[id]/actions");
    await expect(simulatePaymentAction(INVOICE_ID, BUYER)).rejects.toThrow(
      /simulator_path_unavailable_in_live_mode/,
    );
  });

  it("throws in development when a live contract address is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS", "0x" + "01".repeat(20));
    const { simulatePaymentAction } = await import("@/app/i/[id]/actions");
    await expect(simulatePaymentAction(INVOICE_ID, BUYER)).rejects.toThrow(
      /simulator_path_unavailable_in_live_mode/,
    );
  });

  it("does NOT throw in test/dev (no live address set)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS", "");
    const { simulatePaymentAction } = await import("@/app/i/[id]/actions");
    // Will throw "Invoice not found" because the test doesn't seed one,
    // but specifically NOT the live-mode guard error.
    await expect(simulatePaymentAction(INVOICE_ID, BUYER)).rejects.not.toThrow(
      /simulator_path_unavailable_in_live_mode/,
    );
  });

  it("does NOT throw in production when no contracts deployed (mock mode in prod)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS", "");
    const { simulatePaymentAction } = await import("@/app/i/[id]/actions");
    await expect(simulatePaymentAction(INVOICE_ID, BUYER)).rejects.not.toThrow(
      /simulator_path_unavailable_in_live_mode/,
    );
  });
});
