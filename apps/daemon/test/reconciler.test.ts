/**
 * reconciler — the ledger↔chain self-heal. Verifies it repairs a cashout whose
 * DB lags a RELEASED on-chain order (atomic CAS + notify-admin drift alert),
 * does NOT touch a row whose chain status hasn't advanced, and skips (never
 * throws/clobbers) on a bad RPC read. Read-only on-chain — it never signs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const COP = "0x0000000000000000000000000000000000000c04";
const ID = "0x" + "cc".repeat(32);

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

const { reconcileCashouts } = await import("../src/workers/reconciler.js");
const { ON_CHAIN_STATUS } = await import("../src/workers/cashoutAdvancer.js");

function rowsHandler(rows: unknown[]) {
  return (c: { op: string }) =>
    c.op === "select"
      ? { data: rows, error: null }
      : { data: null, error: null };
}

beforeEach(() => {
  H.sbHandlers = {};
  H.sbCalls = [];
  H.q = makeQueue();
  H.arc = makeArc();
});

describe("reconcileCashouts", () => {
  it("repairs a CONFIRMED row whose chain order is RELEASED (CAS + drift alert)", async () => {
    H.sbHandlers = {
      cashout_orders: rowsHandler([{ id: ID, status: "CONFIRMED" }]),
    };
    H.arc = makeArc({
      reads: { getOrder: { status: ON_CHAIN_STATUS.RELEASED } },
    });
    const r = await reconcileCashouts();
    expect(r).toEqual({ checked: 1, repaired: 1 });
    const upd = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "cashout_orders" && c.op === "update",
    );
    expect((upd.payload as { status: string }).status).toBe("RELEASED");
    // atomic CAS on the status we read
    expect(
      upd.filters.some(
        (f: { col: string; val: unknown }) =>
          f.col === "status" && f.val === "CONFIRMED",
      ),
    ).toBe(true);
    const admin = H.q.adds.find(
      (a: { queue: string }) => a.queue === "notify-admin",
    );
    expect((admin.data as { kind: string }).kind).toBe("reconcile.drift");
    // read-only on chain — reconciler never signs
    expect(H.arc.writes).toHaveLength(0);
  });

  it("does NOT repair when the chain status has not advanced to RELEASED", async () => {
    H.sbHandlers = {
      cashout_orders: rowsHandler([{ id: ID, status: "CONFIRMED" }]),
    };
    H.arc = makeArc({
      reads: { getOrder: { status: ON_CHAIN_STATUS.CONFIRMED } },
    });
    const r = await reconcileCashouts();
    expect(r).toEqual({ checked: 1, repaired: 0 });
    expect(H.sbCalls.some((c: { op: string }) => c.op === "update")).toBe(
      false,
    );
    expect(H.q.adds).toHaveLength(0);
  });

  it("skips a row on a bad RPC read (no throw, no clobber)", async () => {
    H.sbHandlers = {
      cashout_orders: rowsHandler([{ id: ID, status: "PROOF_SUBMITTED" }]),
    };
    H.arc = makeArc({ reads: {} }); // getOrder not stubbed → onChainOrder throws
    const r = await reconcileCashouts();
    expect(r).toEqual({ checked: 1, repaired: 0 });
    expect(H.sbCalls.some((c: { op: string }) => c.op === "update")).toBe(
      false,
    );
  });
});
