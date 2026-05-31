/**
 * disputeDecide — the operator-decision money path. Signs DisputeManager.decide
 * with the operator key (the web can't). Verifies the outcome→ordinal mapping,
 * that decide is signed with the right (ordinal, reasonHash, evidenceHash), the
 * isDecided idempotency short-circuit (never double-decides), the simulate-skip
 * on a contract revert (no write), and that a bad outcome throws before touching
 * the chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { makeArc, fakeLog } from "./helpers/fakeInfra.js";

const DM = "0x00000000000000000000000000000000000000dd";

const H = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arc: null as any,
}));
vi.mock("../src/queue.js", () => ({
  startWorker: () => ({}),
  queue: () => ({}),
}));
vi.mock("../src/arc.js", () => ({
  arcPublic: () => H.arc.arcPublic(),
  arcWallet: () => H.arc.arcWallet(),
  requireArcWalletInProd: (w: string) => H.arc.requireArcWalletInProd(w),
}));
vi.mock("../src/log.js", () => ({ log: fakeLog }));
vi.mock("../src/env.js", () => ({
  env: { DISPUTE_MANAGER_ADDRESS: DM, NODE_ENV: "test" },
}));

const { advanceDisputeDecide, outcomeToOrdinal } =
  await import("../src/workers/disputeDecide.js");

const CASE = "0x" + "ab".repeat(32);
const REASON = "0x" + "11".repeat(32);
const EVID = "0x" + "22".repeat(32);

beforeEach(() => {
  H.arc = makeArc({ reads: { isDecided: false } });
});

describe("outcomeToOrdinal", () => {
  it("maps each deciding outcome to its on-chain ordinal", () => {
    expect(outcomeToOrdinal("RELEASE_TO_CLAIMANT")).toBe(1);
    expect(outcomeToOrdinal("REFUND_TO_RESPONDENT")).toBe(2);
    expect(outcomeToOrdinal("SLASH_LP")).toBe(3);
    expect(outcomeToOrdinal("PENALIZE_VENDOR")).toBe(4);
    expect(outcomeToOrdinal("MUTUAL_RESOLVED")).toBe(5);
  });
  it("throws on an unknown / non-deciding outcome (never signs decide(...,0))", () => {
    expect(() => outcomeToOrdinal("PENDING")).toThrow(/bad_outcome/);
    expect(() => outcomeToOrdinal("WAT")).toThrow(/bad_outcome/);
  });
});

describe("advanceDisputeDecide", () => {
  const job = {
    caseId: CASE,
    outcome: "RELEASE_TO_CLAIMANT",
    reasonHash: REASON,
    evidenceHash: EVID,
  };

  it("signs decide(caseId, ordinal, reasonHash, evidenceHash)", async () => {
    await advanceDisputeDecide(job);
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].functionName).toBe("decide");
    expect(H.arc.writes[0].args).toEqual([CASE, 1, REASON, EVID]);
  });

  it("idempotent: already-decided case short-circuits (no simulate, no write)", async () => {
    H.arc = makeArc({ reads: { isDecided: true } });
    await advanceDisputeDecide(job);
    expect(H.arc.simulations).toHaveLength(0);
    expect(H.arc.writes).toHaveLength(0);
  });

  it("a contract revert at simulate is a non-retryable skip — no write, no throw", async () => {
    H.arc = makeArc({
      reads: { isDecided: false },
      simulateThrow: () =>
        new BaseError("reverted", {
          cause: new ContractFunctionRevertedError({
            abi: [],
            functionName: "decide",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        }),
    });
    await expect(advanceDisputeDecide(job)).resolves.toBeUndefined();
    expect(H.arc.writes).toHaveLength(0);
  });

  it("a transient error rethrows for retry", async () => {
    H.arc = makeArc({
      reads: { isDecided: false },
      simulateThrow: () => new Error("ECONNRESET"),
    });
    await expect(advanceDisputeDecide(job)).rejects.toThrow(/ECONNRESET/);
  });

  it("a bad outcome throws before any chain interaction", async () => {
    await expect(
      advanceDisputeDecide({ ...job, outcome: "PENDING" }),
    ).rejects.toThrow(/bad_outcome/);
    expect(H.arc.simulations).toHaveLength(0);
    expect(H.arc.writes).toHaveLength(0);
  });
});
