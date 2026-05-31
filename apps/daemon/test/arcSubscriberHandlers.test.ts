/**
 * arcSubscriber event handlers — the chain→DB sync that the rest of the product
 * reads as truth. Verifies: InvoicePaid flips ONLY CREATED/ACCEPTED→PAID
 * (conservative) + captures the buyer sig + fans out screening; Decided mirrors
 * the outcome enum + enqueues the resolver; JobCompleted closes the agent job.
 * These are the handlers that, if wrong, make the UI lie about on-chain state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeFunctionData, parseAbi, keccak256 } from "viem";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const H = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbHandlers: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arc: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txInput: "0x" as any,
  txThrows: false,
}));

vi.mock("../src/db.js", () => ({
  sb: () => makeSb(H.sbHandlers, H.sbCalls).sb(),
}));
vi.mock("../src/queue.js", () => ({
  queue: (name: string) => H.q.queue(name),
}));
vi.mock("../src/arc.js", () => ({
  arcPublic: () => ({
    ...H.arc.arcPublic(),
    getTransaction: async () => {
      if (H.txThrows) throw new Error("rpc down");
      return { input: H.txInput };
    },
  }),
}));
vi.mock("../src/redis.js", () => ({
  claimOnce: async () => true,
  releaseClaimBounded: async () => ({ released: true, retryCount: 0 }),
  clearRetryCounter: async () => {},
  redis: () => ({}),
}));
vi.mock("../src/log.js", () => ({ log: fakeLog }));
vi.mock("../src/env.js", () => ({ env: { NODE_ENV: "test" } }));

const { handleInvoicePaidEvent, handleDecidedEvent, handleJobCompletedEvent } =
  await import("../src/listener/arcSubscriber.js");

const INV = "0x" + "17".repeat(32);
const CASE = "0x" + "ab".repeat(32);
const JOB = "0x" + "a9".repeat(32);
const BUYER = "0x00000000000000000000000000000000000000b1";
const TX = "0x" + "fe".repeat(32);

beforeEach(() => {
  H.sbHandlers = {};
  H.sbCalls = [];
  H.q = makeQueue();
  H.arc = makeArc();
  H.txThrows = false;
});

describe("handleInvoicePaidEvent", () => {
  beforeEach(() => {
    H.sbHandlers = { invoices: () => ({ error: null }) };
  });

  it("flips ONLY CREATED/ACCEPTED → PAID (conservative) + captures the buyer sig", async () => {
    const sig = "0xc0ffee";
    H.txInput = encodeFunctionData({
      abi: parseAbi([
        "function acceptAndPay(bytes32 invoiceId, bytes buyerSignature, address buyer)",
      ]),
      functionName: "acceptAndPay",
      args: [INV, sig, BUYER],
    });
    await handleInvoicePaidEvent({
      args: { invoiceId: INV, buyer: BUYER, amount: 1000n },
      transactionHash: TX,
    });
    const upd = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "invoices" && c.op === "update",
    );
    expect((upd.payload as { status: string }).status).toBe("PAID");
    expect((upd.payload as { acceptance_sig?: string }).acceptance_sig).toBe(
      keccak256(sig),
    );
    expect((upd.payload as { paid_tx_hash: string }).paid_tx_hash).toBe(TX);
    // the conservative .in(["CREATED","ACCEPTED"]) guard
    const inFilter = upd.filters.find((f: { kind: string }) => f.kind === "in");
    expect(inFilter.val).toEqual(["CREATED", "ACCEPTED"]);
  });

  it("still flips PAID + fans out screening when sig capture fails (best-effort)", async () => {
    H.txThrows = true;
    await handleInvoicePaidEvent({
      args: { invoiceId: INV, buyer: BUYER, amount: 1000n },
      transactionHash: TX,
    });
    const upd = H.sbCalls.find((c: { op: string }) => c.op === "update");
    expect((upd.payload as { status: string }).status).toBe("PAID");
    expect(
      (upd.payload as Record<string, unknown>).acceptance_sig,
    ).toBeUndefined();
    const screen = H.q.adds.find(
      (a: { queue: string }) => a.queue === "screen-and-settle",
    );
    expect(screen).toBeTruthy();
    expect((screen.data as { invoiceId: string }).invoiceId).toBe(INV);
  });
});

describe("handleDecidedEvent", () => {
  beforeEach(() => {
    H.sbHandlers = { disputes: () => ({ error: null }) };
  });

  it("mirrors the outcome enum + enqueues notify-admin AND the resolver", async () => {
    await handleDecidedEvent({
      args: { caseId: CASE, outcome: 1, reasonHash: "0x" + "11".repeat(32) },
      transactionHash: TX,
    });
    const upd = H.sbCalls.find(
      (c: { table: string }) => c.table === "disputes",
    );
    expect((upd.payload as { status: string }).status).toBe("DECIDED");
    expect((upd.payload as { outcome: string }).outcome).toBe(
      "RELEASE_TO_CLAIMANT",
    );
    expect(
      H.q.adds.some((a: { queue: string }) => a.queue === "notify-admin"),
    ).toBe(true);
    const resolve = H.q.adds.find(
      (a: { queue: string }) => a.queue === "dispute-resolve",
    );
    expect(resolve).toBeTruthy();
    expect((resolve.data as { caseId: string }).caseId).toBe(CASE);
  });

  it("omits a bogus/unknown outcome (e.g. 0) rather than writing garbage", async () => {
    await handleDecidedEvent({
      args: { caseId: CASE, outcome: 0, reasonHash: null as never },
      transactionHash: TX,
    });
    const upd = H.sbCalls.find(
      (c: { table: string }) => c.table === "disputes",
    );
    expect((upd.payload as { status: string }).status).toBe("DECIDED");
    expect("outcome" in (upd.payload as object)).toBe(false);
  });
});

describe("handleJobCompletedEvent", () => {
  it("closes the agent job from chain truth + notifies the vendor", async () => {
    H.sbHandlers = { agent_jobs: () => ({ error: null }) };
    await handleJobCompletedEvent({
      args: { jobId: JOB },
      transactionHash: TX,
    });
    const upd = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "agent_jobs" && c.op === "update",
    );
    expect((upd.payload as { status: string }).status).toBe("CLOSED");
    const jobFilter = upd.filters.find(
      (f: { col: string }) => f.col === "job_id",
    );
    expect(jobFilter.val).toBe(JOB);
    expect(
      H.q.adds.some(
        (a: { queue: string; data: { kind?: string } }) =>
          a.queue === "notify-vendor" && a.data.kind === "agent.job.completed",
      ),
    ).toBe(true);
  });
});
