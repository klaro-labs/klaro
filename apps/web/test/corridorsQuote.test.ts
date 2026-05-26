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
});
