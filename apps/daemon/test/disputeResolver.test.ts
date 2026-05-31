/**
 * disputeResolver.advanceDisputeResolution — the money-moving fan-out from a
 * decided dispute to the right escrow's resolveDispute. Verifies: routing →
 * correct contract + args, AgentEscrow payToAgent derived from chain truth, the
 * idempotent simulate-skip on a contract revert (NEVER writes), a transient
 * error rethrows for retry, and SLASH_LP defers to an admin (never auto-signs).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const AGENT_ADDR = "0x000000000000000000000000000000000000a9e1";
const CASHOUT_ADDR = "0x0000000000000000000000000000000000000c04";
const STREAM_ADDR = "0x0000000000000000000000000000000000005712";
const DM_ADDR = "0x00000000000000000000000000000000000000dd";

// Hoisted mutable holder so the (hoisted) vi.mock factories can read per-test
// state assigned in beforeEach.
const H = vi.hoisted(() => ({
  disputeRow: null as Record<string, unknown> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arc: null as any,
}));

vi.mock("../src/db.js", () => ({
  sb: () =>
    makeSb({ disputes: () => ({ data: H.disputeRow, error: null }) }).sb(),
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
  env: {
    AGENT_ESCROW_ADDRESS: AGENT_ADDR,
    CASHOUT_ORDER_PROCESSOR_ADDRESS: CASHOUT_ADDR,
    RETAINER_STREAM_ADDRESS: STREAM_ADDR,
    DISPUTE_MANAGER_ADDRESS: DM_ADDR,
    NODE_ENV: "test",
  },
}));

const { advanceDisputeResolution } =
  await import("../src/workers/disputeResolver.js");

const CASE = "0x" + "ab".repeat(32);
const JOBS_TUPLE = (agent: string) => [
  "0xprincipal",
  "0xagentid",
  agent,
  "0xtoken",
  0n,
  0n,
  "0x",
  4,
  "0x",
  0n,
  0n,
  0n,
  0n,
];

beforeEach(() => {
  H.disputeRow = null;
  H.q = makeQueue();
  H.arc = makeArc();
});

describe("advanceDisputeResolution routing + args", () => {
  it("cashout RELEASE → resolveDispute(id, 0, reasonHash) on the cashout escrow", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "cashout",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: "0x" + "11".repeat(32),
    };
    await advanceDisputeResolution(CASE);
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].address.toLowerCase()).toBe(CASHOUT_ADDR);
    expect(H.arc.writes[0].functionName).toBe("resolveDispute");
    expect(H.arc.writes[0].args).toEqual([CASE, 0n, "0x" + "11".repeat(32)]);
  });

  it("stream REFUND → resolveDispute(id) on the retainer-stream escrow", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "stream",
      outcome: "REFUND_TO_RESPONDENT",
      decision_reason_hash: null,
    };
    await advanceDisputeResolution(CASE);
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].address.toLowerCase()).toBe(STREAM_ADDR);
    expect(H.arc.writes[0].args).toEqual([CASE]);
  });

  it("agent RELEASE: payToAgent=true when the claimant IS the agent", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "agent",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: null,
    };
    H.arc = makeArc({
      reads: {
        jobs: JOBS_TUPLE(AGENT_ADDR),
        getCase: { claimant: AGENT_ADDR },
      },
    });
    await advanceDisputeResolution(CASE);
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].address.toLowerCase()).toBe(AGENT_ADDR);
    expect(H.arc.writes[0].args).toEqual([CASE, true]);
  });

  it("agent RELEASE: payToAgent=false when the claimant is NOT the agent", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "agent",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: null,
    };
    H.arc = makeArc({
      reads: {
        jobs: JOBS_TUPLE(AGENT_ADDR),
        getCase: { claimant: "0x00000000000000000000000000000000000000ff" },
      },
    });
    await advanceDisputeResolution(CASE);
    expect(H.arc.writes[0].args).toEqual([CASE, false]);
  });

  it("agent REFUND: payToAgent=true when the agent is the respondent (claimant != agent)", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "agent",
      outcome: "REFUND_TO_RESPONDENT",
      decision_reason_hash: null,
    };
    H.arc = makeArc({
      reads: {
        jobs: JOBS_TUPLE(AGENT_ADDR),
        getCase: { claimant: "0x00000000000000000000000000000000000000ff" },
      },
    });
    await advanceDisputeResolution(CASE);
    // REFUND pays the respondent; claimant != agent ⇒ agent is respondent ⇒ pay agent
    expect(H.arc.writes[0].args).toEqual([CASE, true]);
  });
});

describe("advanceDisputeResolution safety", () => {
  it("simulates before writing", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "cashout",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: null,
    };
    await advanceDisputeResolution(CASE);
    expect(H.arc.simulations).toHaveLength(1);
    expect(H.arc.simulations[0].functionName).toBe("resolveDispute");
  });

  it("a contract revert at simulate is an idempotent skip — NO write, no throw", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "stream",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: null,
    };
    H.arc = makeArc({
      simulateThrow: () =>
        new BaseError("reverted", {
          cause: new ContractFunctionRevertedError({
            abi: [],
            functionName: "resolveDispute",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        }),
    });
    await expect(advanceDisputeResolution(CASE)).resolves.toBeUndefined();
    expect(H.arc.writes).toHaveLength(0);
  });

  it("a transient (non-revert) error rethrows for BullMQ retry", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "stream",
      outcome: "RELEASE_TO_CLAIMANT",
      decision_reason_hash: null,
    };
    H.arc = makeArc({ simulateThrow: () => new Error("ECONNRESET") });
    await expect(advanceDisputeResolution(CASE)).rejects.toThrow(/ECONNRESET/);
    expect(H.arc.writes).toHaveLength(0);
  });

  it("SLASH_LP defers to admin — notify-admin enqueued, NO escrow write", async () => {
    H.disputeRow = {
      case_id: CASE,
      source: "cashout",
      outcome: "SLASH_LP",
      decision_reason_hash: null,
    };
    await advanceDisputeResolution(CASE);
    expect(H.arc.writes).toHaveLength(0);
    expect(H.arc.simulations).toHaveLength(0);
    const admin = H.q.adds.find(
      (a: { queue: string }) => a.queue === "notify-admin",
    );
    expect(admin).toBeTruthy();
    expect(admin.data.kind).toBe("dispute.manual_resolution_required");
  });

  it("a missing dispute row is a no-op (no write, no throw)", async () => {
    H.disputeRow = null;
    await expect(advanceDisputeResolution(CASE)).resolves.toBeUndefined();
    expect(H.arc.writes).toHaveLength(0);
  });
});
