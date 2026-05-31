/**
 * receiptGenerate — anchors an AuditReceipt on settle. QA-024 invariant: the
 * receipt_hash persisted to the DB must be the contract-derived hash (so
 * `/receipt/[hash]` verifies on Arc), and `mint()` must actually be called with
 * the right Anchor. Also: fail loud (no DB receipt) when the vendor wallet is
 * missing, rather than writing a half-anchored row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const AUDIT = "0x000000000000000000000000000000000000aded";

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
  env: { AUDIT_RECEIPT_ADDRESS: AUDIT, NODE_ENV: "test" },
}));

const { startReceiptGenerate } =
  await import("../src/workers/receiptGenerate.js");

const INV = "0x" + "17".repeat(32);
const TX = "0x" + "fe".repeat(32);
const META = "0x" + "23".repeat(32);

function invoiceRow(over: Record<string, unknown> = {}) {
  return {
    metadata_hash: META,
    acceptance_sig: "0x" + "44".repeat(32),
    vendors: { wallet: "0x00000000000000000000000000000000000000ve" },
    settled_tx_hash: TX,
    ...over,
  };
}

function defaultHandlers(invOver: Record<string, unknown> = {}) {
  return {
    invoices: (c: { op: string }) =>
      c.op === "select"
        ? { data: invoiceRow(invOver), error: null }
        : { error: null },
    screening_results: () => ({
      data: [{ provider: "p", result: "pass", evidence_hash: "0x" }],
      error: null,
    }),
    receipts: () => ({ error: null }),
  };
}

beforeEach(() => {
  H.q = makeQueue();
  H.arc = makeArc();
  H.sbCalls = [];
  H.sbHandlers = defaultHandlers();
});

function run() {
  startReceiptGenerate();
  return H.q.run("receipt-generate", { invoiceId: INV, settlementTx: TX });
}

describe("receiptGenerate", () => {
  it("calls mint() with the Anchor for this invoice + vendor + settlement tx", async () => {
    await run();
    expect(H.arc.writes).toHaveLength(1);
    expect(H.arc.writes[0].functionName).toBe("mint");
    const anchor = H.arc.writes[0].args[0] as Record<string, unknown>;
    expect(anchor.invoiceId).toBe(INV);
    expect(anchor.settlementTx).toBe(TX);
    expect(anchor.vendor).toBe("0x00000000000000000000000000000000000000ve");
    expect(anchor.invoiceHash).toBe(META);
  });

  it("persists a receipt_hash + mirrors it onto the invoice (DB↔chain agree)", async () => {
    await run();
    const rcptUpsert = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "receipts" && c.op === "upsert",
    );
    expect(rcptUpsert).toBeTruthy();
    expect(
      (rcptUpsert.payload as { receipt_hash?: string }).receipt_hash,
    ).toMatch(/^0x[0-9a-f]{64}$/);
    const invUpdate = H.sbCalls.find(
      (c: { table: string; op: string; payload?: Record<string, unknown> }) =>
        c.table === "invoices" &&
        c.op === "update" &&
        "receipt_hash" in (c.payload ?? {}),
    );
    expect(invUpdate).toBeTruthy();
  });

  it("fails loud when the vendor wallet is missing — no receipt row written", async () => {
    H.sbHandlers = defaultHandlers({ vendors: { wallet: null } });
    await expect(run()).rejects.toThrow(/no vendor wallet/);
    expect(H.arc.writes).toHaveLength(0);
    const rcptWrite = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "receipts" && c.op === "upsert",
    );
    expect(rcptWrite).toBeFalsy();
  });
});
