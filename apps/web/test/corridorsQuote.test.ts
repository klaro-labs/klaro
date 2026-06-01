import { describe, it, expect } from "vitest";
import { quoteCashout, CORRIDORS } from "@/lib/corridors";

/**
 * Regression — every corridor in `lib/corridors.ts` must produce a non-null
 * `quoteCashout()` result. the API quote
 * endpoint previously had its own rate table that diverged from this lib on
 * every pair. Now both use `quoteCashout()`; this test pins the contract.
 */
describe("corridors.quoteCashout", () => {
  for (const c of CORRIDORS) {
    it(`prices ${c.currency} without error`, () => {
      const q = quoteCashout(1_000_000n, c.currency); // $1
      expect(q).not.toBeNull();
      if (!q) return;
      expect(q.corridor.currency).toBe(c.currency);
      expect(q.usdcAmount).toBe(1_000_000n);
      // payoutMinor must reflect the corridor rate after fees.
      const fee =
        (1_000_000n * BigInt(Math.round(c.klaroFee * 1_000_000))) / 1_000_000n;
      const spread =
        (1_000_000n * BigInt(Math.round(c.lpSpread * 1_000_000))) / 1_000_000n;
      expect(q.klaroFeeUsdc).toBe(fee);
      expect(q.lpSpreadUsdc).toBe(spread);
    });
  }

  it("returns null for unknown corridor", () => {
    expect(quoteCashout(1_000_000n, "XXX")).toBeNull();
  });

  // payoutMinor is anchored into the quoteHash, so it must be PURE bigint — the
  // old `Number(netUsdc)` double path drifted at large amounts / high-rate
  // corridors and would break the quote/recompute-equality invariant.
  it("payoutMinor is exact bigint at large amounts (no float drift)", () => {
    const big = 999_000_000_000_000n; // ~$999M, under the $1B safe cap
    for (const code of ["NGN", "KRW"]) {
      const c = CORRIDORS.find((x) => x.currency === code);
      if (!c) continue;
      const q = quoteCashout(big, code);
      expect(q).not.toBeNull();
      if (!q) continue;
      const net = q.usdcAmount - q.klaroFeeUsdc - q.lpSpreadUsdc;
      const rateScaled = BigInt(Math.round(c.rate * 1_000_000));
      const expected = (net * rateScaled * 100n) / 1_000_000_000_000n;
      expect(q.payoutMinor).toBe(expected);
    }
  });

  it("two independent quotes for the same input are byte-identical (hashable)", () => {
    const a = quoteCashout(1_000_001n, "INR");
    const b = quoteCashout(1_000_001n, "INR");
    expect(a && b).toBeTruthy();
    if (!a || !b) return;
    expect(a.payoutMinor).toBe(b.payoutMinor);
    expect(a.klaroFeeUsdc).toBe(b.klaroFeeUsdc);
    expect(a.lpSpreadUsdc).toBe(b.lpSpreadUsdc);
  });
});
