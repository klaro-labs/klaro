/**
 * Regression for loop : cashout claim TOCTOU race. Two LPs reading
 * a REQUESTED order at the same moment would BOTH advance it to CLAIMED
 * because `advanceCashout` did not enforce the prior status. The second
 * silently overwrote the first LP's claim + timeline entry.
 * The fix made `advanceCashout` conditional on the caller-asserted
 * `requireFromStatus`. The atomic UPDATE returns null when the row's
 * status no longer matches → caller treats null as "lost the race" and
 * surfaces it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  mockCreateCashout,
  mockAdvanceCashout,
  mockGetCashout,
} from "@/lib/mockData";
import type { Hex, CashoutOrder } from "@/lib/types";

async function freshOrder(): Promise<CashoutOrder> {
  return mockCreateCashout({
    vendorId: "vendor-asha",
    vendorWallet: "0x0000000000000000000000000000000000000abc",
    usdcAmount: 1_000_000_000n,
    payoutMinor: 8_390_000n,
    currency: "INR",
    klaroFeeUsdc: 5_000_000n,
    lpSpreadUsdc: 2_000_000n,
    quoteRate: 83.9,
    quoteHash: ("0x" + "ab".repeat(32)) as Hex,
    quoteExpiresAt: new Date(Date.now() + 60_000),
  });
}

describe("cashout TOCTOU close (iter 65)", () => {
  let order: CashoutOrder;

  beforeEach(async () => {
    order = await freshOrder();
    // Cashouts created by createCashout start LOCKED; the simulator
    // advancer flips to REQUESTED in real flow. For this race test we
    // jump straight to REQUESTED to mirror the LP queue state.
    await mockAdvanceCashout(order.id, "REQUESTED", {
      kind: "locked",
      at: new Date(),
      detail: "test seed: flip to REQUESTED",
    });
  });

  it("rejects the second claim when status no longer matches", async () => {
    const claimA = await mockAdvanceCashout(
      order.id,
      "CLAIMED",
      { kind: "lp_assigned", at: new Date(), detail: "LP A" },
      { lpId: "lp-a", lpName: "LP A" },
      "REQUESTED",
    );
    expect(claimA?.lpId).toBe("lp-a");

    // LP B observed the same REQUESTED snapshot and races a second claim.
    // The conditional UPDATE matches no row (status moved to CLAIMED) →
    // returns null. Caller surfaces "lost the race", does NOT overwrite.
    const claimB = await mockAdvanceCashout(
      order.id,
      "CLAIMED",
      { kind: "lp_assigned", at: new Date(), detail: "LP B" },
      { lpId: "lp-b", lpName: "LP B" },
      "REQUESTED",
    );
    expect(claimB).toBeNull();

    const persisted = await mockGetCashout(order.id);
    expect(persisted?.lpId).toBe("lp-a");
  });

  it("accepts the advance when the caller-asserted prior status matches", async () => {
    const advanced = await mockAdvanceCashout(
      order.id,
      "CLAIMED",
      { kind: "lp_assigned", at: new Date(), detail: "LP A" },
      { lpId: "lp-a" },
      "REQUESTED",
    );
    expect(advanced).not.toBeNull();
    expect(advanced?.status).toBe("CLAIMED");
  });

  it("still works when no prior status is asserted (back-compat)", async () => {
    // Legacy callers that pass undefined should keep the old behavior —
    // unconditional update — so the new param is fully additive.
    const advanced = await mockAdvanceCashout(order.id, "CLAIMED", {
      kind: "lp_assigned",
      at: new Date(),
      detail: "no assertion",
    });
    expect(advanced).not.toBeNull();
  });
});
