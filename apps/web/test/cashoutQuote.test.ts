import { describe, it, expect } from "vitest";
import { computeQuoteHash } from "@/lib/cashoutQuote";
import type { Hex } from "@/lib/types";

const VENDOR_WALLET = "0x7a3c1f9f9a8d1e2c4b9a8d6c4b3a2e1d0c9b8a7f" as Hex;

describe("computeQuoteHash", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeQuoteHash({
      vendor: VENDOR_WALLET,
      usdcAmount: 1_000_000n,
      payoutMinor: 83_400_00n,
      currency: "INR",
      klaroFeeUsdc: 3_000n,
      lpSpreadUsdc: 4_000n,
      expiresAtSecs: 1700000000n,
    });
    const b = computeQuoteHash({
      vendor: VENDOR_WALLET,
      usdcAmount: 1_000_000n,
      payoutMinor: 83_400_00n,
      currency: "INR",
      klaroFeeUsdc: 3_000n,
      lpSpreadUsdc: 4_000n,
      expiresAtSecs: 1700000000n,
    });
    expect(a).toBe(b);
  });

  it("changes when ANY field changes", () => {
    const base = {
      vendor: VENDOR_WALLET,
      usdcAmount: 1_000_000n,
      payoutMinor: 83_400_00n,
      currency: "INR",
      klaroFeeUsdc: 3_000n,
      lpSpreadUsdc: 4_000n,
      expiresAtSecs: 1700000000n,
    };
    const h0 = computeQuoteHash(base);
    const variants = [
      { ...base, usdcAmount: 1_000_001n },
      { ...base, payoutMinor: 83_400_01n },
      { ...base, currency: "BRL" },
      { ...base, klaroFeeUsdc: 3_001n },
      { ...base, lpSpreadUsdc: 4_001n },
      { ...base, expiresAtSecs: 1700000001n },
      { ...base, vendor: "0x0000000000000000000000000000000000000001" as Hex },
    ];
    for (const v of variants) {
      expect(computeQuoteHash(v)).not.toBe(h0);
    }
  });
});
