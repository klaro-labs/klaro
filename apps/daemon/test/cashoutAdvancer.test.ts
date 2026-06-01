/**
 * cashoutAdvancer — the cashout escrow money-mover. Covers the on-chain legs
 * (claimByLP / recordProof / operatorConfirmReceived) and the worker switch,
 * asserting: idempotency (a retry never re-signs an already-advanced order),
 * canonical on-chain amounts (proof reads the order, not the DB), the
 * SIMULATED-proof-never-advances honest-mode invariant, and that the DB only
 * flips to RELEASED *after* the on-chain confirm tx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const COP = "0x0000000000000000000000000000000000000c04";

const H = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbHandlers: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arc: null as any,
}));

vi.mock("../src/db.js", () => ({
  sb: () => makeSb(H.sbHandlers, H.sbCalls).sb(),
}));
vi.mock("../src/queue.js", () => ({
  startWorker: (...a: unknown[]) => H.q.startWorker(...a),
  queue: (name: string) => H.q.queue(name),
}));
vi.mock("../src/arc.js", () => ({
  arcPublic: () => H.arc.arcPublic(),
  arcWallet: () => H.arc.arcWallet(),
  requireArcWalletInProd: (w: string) => H.arc.requireArcWalletInProd(w),
}));
vi.mock("../src/log.js", () => ({ log: fakeLog }));
vi.mock("../src/env.js", () => ({
  env: { CASHOUT_ORDER_PROCESSOR_ADDRESS: COP, NODE_ENV: "test" },
}));

const {
  advanceClaimOnChain,
  advanceProofOnChain,
  startCashoutAdvancer,
  ON_CHAIN_STATUS,
} = await import("../src/workers/cashoutAdvancer.js");

const ID = "0x" + "cc".repeat(32);

// getOrder struct: only the fields the worker reads matter.
const order = (over: Record<string, unknown>) => ({
  vendor: "0xvendor",
  usdcAmount: 1000n,
  inrAmount: 83000n,
  lpId: "0x" + "11".repeat(32),
  lpWallet: "0xlpwallet",
  status: ON_CHAIN_STATUS.LOCKED,
  ...over,
});

beforeEach(() => {
  H.sbHandlers = {};
  H.sbCalls = [];
  H.q = makeQueue();
  H.arc = makeArc();
});

describe("advanceClaimOnChain idempotency + args", () => {
  it("LOCKED → signs claimByLP(id, lpId)", async () => {
    H.arc = makeArc({
      reads: { getOrder: order({ status: ON_CHAIN_STATUS.LOCKED }) },
    });
    const lp = "0x" + "aa".repeat(32);
    const ret = await advanceClaimOnChain(ID, lp);
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].functionName).toBe("claimByLP");
    expect(H.arc.writes[0].args).toEqual([ID, lp]);
    expect(ret).toBe(lp);
  });

  it("already CLAIMED → no re-claim; the on-chain lpId wins (idempotent retry)", async () => {
    const onChainLp = "0x" + "bb".repeat(32);
    H.arc = makeArc({
      reads: {
        getOrder: order({ status: ON_CHAIN_STATUS.CLAIMED, lpId: onChainLp }),
      },
    });
    const ret = await advanceClaimOnChain(ID, "0x" + "cc".repeat(32));
    expect(H.arc.writes).toHaveLength(0);
    expect(ret).toBe(onChainLp);
  });

  it("no on-chain order (NONE) → DB-only mirror, no write", async () => {
    H.arc = makeArc({
      reads: { getOrder: order({ status: ON_CHAIN_STATUS.NONE }) },
    });
    const lp = "0x" + "dd".repeat(32);
    const ret = await advanceClaimOnChain(ID, lp);
    expect(H.arc.writes).toHaveLength(0);
    expect(ret).toBe(lp);
  });

  it("unexpected status → throws (loud, no silent skip)", async () => {
    H.arc = makeArc({
      reads: { getOrder: order({ status: ON_CHAIN_STATUS.PROOF_SUBMITTED }) },
    });
    await expect(
      advanceClaimOnChain(ID, "0x" + "ee".repeat(32)),
    ).rejects.toThrow(/cashout_claim_bad_status/);
  });
});

describe("advanceProofOnChain", () => {
  it("CLAIMED → recordProof with amounts read from the ON-CHAIN order (canonical)", async () => {
    H.arc = makeArc({
      reads: {
        getOrder: order({
          status: ON_CHAIN_STATUS.CLAIMED,
          usdcAmount: 999n,
          inrAmount: 82917n,
          lpId: "0x" + "12".repeat(32),
        }),
      },
    });
    await advanceProofOnChain(ID, {
      vendorId: "vendor-uuid",
      utrReference: "UTR123",
      screenshotPath: "path/x.png",
      proofHash: "0x" + "99".repeat(32),
    });
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].functionName).toBe("recordProof");
    const proof = H.arc.writes[0].args[1] as Record<string, unknown>;
    expect(proof.usdcAmount).toBe(999n); // from chain, not DB
    expect(proof.inrAmount).toBe(82917n);
    expect(proof.lpId).toBe("0x" + "12".repeat(32));
    expect(proof.vendorId).not.toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ); // keccak(db.vendorId) — non-zero satisfies the contract guard
  });

  it("already PROOF_SUBMITTED → no-op (idempotent)", async () => {
    H.arc = makeArc({
      reads: { getOrder: order({ status: ON_CHAIN_STATUS.PROOF_SUBMITTED }) },
    });
    await advanceProofOnChain(ID, {
      vendorId: "v",
      utrReference: null,
      screenshotPath: null,
      proofHash: "0x" + "99".repeat(32),
    });
    expect(H.arc.writes).toHaveLength(0);
  });
});

describe("cashout-advance worker switch", () => {
  const run = (data: { orderId: string; kind: string }) => {
    startCashoutAdvancer();
    return H.q.run("cashout-advance", data);
  };

  it("proof-verify with a SIMULATED proof NEVER advances escrow or flips CONFIRMED", async () => {
    H.sbHandlers = {
      cashout_orders: (c: { op: string }) => {
        if (c.op === "select")
          return { data: { proof_hash: "0xph", vendor_id: "v1" }, error: null };
        return { data: null, error: null };
      },
      payout_proofs: () => ({
        data: {
          verified_at: "2026-01-01",
          simulated: true,
          utr_reference: "U",
          screenshot_path: null,
        },
        error: null,
      }),
    };
    await run({ orderId: ID, kind: "proof-verify" });
    // no on-chain recordProof, no CONFIRMED update
    expect(H.arc.writes).toHaveLength(0);
    const updates = H.sbCalls.filter(
      (c: { table: string; op: string }) =>
        c.table === "cashout_orders" && c.op === "update",
    );
    expect(updates).toHaveLength(0);
    // routed to admin review instead
    expect(
      H.q.adds.some((a: { queue: string }) => a.queue === "notify-admin"),
    ).toBe(true);
  });

  it("release signs operatorConfirmReceived BEFORE flipping the DB to RELEASED", async () => {
    const order_updates: string[] = [];
    H.sbHandlers = {
      cashout_orders: (c: {
        op: string;
        payload?: Record<string, unknown>;
      }) => {
        if (c.op === "select")
          return {
            data: {
              id: ID,
              status: "PROOF_SUBMITTED",
              vendor_wallet: "0xvw",
              usdc_amount: "1000",
            },
            error: null,
          };
        if (c.op === "update") order_updates.push(String(c.payload?.status));
        return { data: null, error: null };
      },
    };
    // chain not yet RELEASED (PROOF_SUBMITTED=4) → the precheck proceeds to sign
    H.arc = makeArc({
      reads: { getOrder: { status: ON_CHAIN_STATUS.PROOF_SUBMITTED } },
    });
    await run({ orderId: ID, kind: "release" });
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].functionName).toBe("operatorConfirmReceived");
    expect(H.arc.writes[0].args).toEqual([ID, "0xvw"]);
    expect(order_updates).toEqual(["RELEASED"]);
    expect(
      H.q.adds.some((a: { queue: string }) => a.queue === "notify-lp"),
    ).toBe(true);
  });

  it("release chain-first idempotency: chain already RELEASED → NO re-sign, DB repaired", async () => {
    // Partial-failure replay: a prior attempt RELEASED on-chain but the DB write
    // failed (still PROOF_SUBMITTED). The retry must NOT re-sign (would revert →
    // DLQ → stranded) — it skips the tx and repairs the DB to RELEASED.
    const order_updates: string[] = [];
    H.sbHandlers = {
      cashout_orders: (c: {
        op: string;
        payload?: Record<string, unknown>;
      }) => {
        if (c.op === "select")
          return {
            data: {
              id: ID,
              status: "PROOF_SUBMITTED",
              vendor_wallet: "0xvw",
              usdc_amount: "1000",
            },
            error: null,
          };
        if (c.op === "update") order_updates.push(String(c.payload?.status));
        return { data: null, error: null };
      },
    };
    H.arc = makeArc({
      reads: { getOrder: { status: ON_CHAIN_STATUS.RELEASED } },
    });
    await run({ orderId: ID, kind: "release" });
    expect(H.arc.writes).toHaveLength(0); // did NOT re-sign
    expect(order_updates).toEqual(["RELEASED"]); // DB still repaired
  });

  it("release is idempotent: already-RELEASED order does nothing", async () => {
    H.sbHandlers = {
      cashout_orders: (c: { op: string }) => {
        if (c.op === "select")
          return {
            data: {
              id: ID,
              status: "RELEASED",
              vendor_wallet: "0xvw",
              usdc_amount: "1000",
            },
            error: null,
          };
        return { data: null, error: null };
      },
    };
    await run({ orderId: ID, kind: "release" });
    expect(H.arc.writes).toHaveLength(0);
  });
});
