/**
 * stakeTier — LP stake→tier mapping. Pins T4 (≥ $10k), which `stakeAction`
 * previously lacked (a $10k+ stake was capped at T3). Tier gates payout caps +
 * auto-claim, so a wrong tier is an economic mis-grant.
 */
import { describe, it, expect } from "vitest";
import { stakeTier } from "@/lib/lpTiers";

describe("stakeTier", () => {
  it("maps each threshold to the right tier (incl. the previously-missing T4)", () => {
    expect(stakeTier(49)).toBe(0);
    expect(stakeTier(50)).toBe(0);
    expect(stakeTier(100)).toBe(1);
    expect(stakeTier(499)).toBe(1);
    expect(stakeTier(500)).toBe(2);
    expect(stakeTier(2000)).toBe(3);
    expect(stakeTier(9999)).toBe(3);
    expect(stakeTier(10000)).toBe(4); // was wrongly 3
    expect(stakeTier(25000)).toBe(4);
  });
});
