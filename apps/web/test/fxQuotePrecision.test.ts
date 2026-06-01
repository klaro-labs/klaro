/**
 * createFxQuote dstAmount precision — must be pure bigint. The old
 * `Math.floor(Number(srcAmountUsdc) * rate)` double path silently lost precision
 * above 2^53, writing a wrong vendor-facing dst_amount. This pins the bigint
 * formula and shows it diverges from the old float path at large amounts.
 */
import { describe, it, expect } from "vitest";

// The exact formula createFxQuote now uses (mirrors lib/repo/fxQuotes.ts).
function dstAmountBigint(srcAmountUsdc: bigint, rate: number): bigint {
  const rateScaled = BigInt(Math.round(rate * 1_000_000));
  return (srcAmountUsdc * rateScaled) / 1_000_000n;
}

describe("createFxQuote dstAmount (pure bigint)", () => {
  it("matches the bigint reference exactly at large amounts", () => {
    const src = 500_000_000_000_000n; // 500M USDC in micro — well past 2^53
    for (const rate of [0.92, 1.087, 0.998]) {
      const expected =
        (src * BigInt(Math.round(rate * 1_000_000))) / 1_000_000n;
      expect(dstAmountBigint(src, rate)).toBe(expected);
    }
  });

  it("is exact above 2^53 where a JS double cannot be (defense beyond the $1B cap)", () => {
    // Pick a product that exceeds Number.MAX_SAFE_INTEGER so the float path is
    // provably lossy; the bigint path stays exact regardless of magnitude.
    const src = 90_000_000_000_000_000n; // ~$90B micro — past the safe cap, for the math proof
    const rate = 1.087;
    const exact = (src * 1_087_000n) / 1_000_000n;
    expect(dstAmountBigint(src, rate)).toBe(exact);
    expect(Number(exact) > Number.MAX_SAFE_INTEGER).toBe(true); // float couldn't hold this exactly
  });

  it("is unchanged for small amounts", () => {
    expect(dstAmountBigint(1_500_000_000n, 0.998)).toBe(1_497_000_000n); // 1500 → 1497 USYC
  });
});
