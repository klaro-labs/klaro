/**
 * screenAndSettle — runs on InvoicePaid. The money-safety invariant: while
 * screening is SIMULATED (no live provider), it must hold the invoice in manual
 * review and NEVER settle — no `settle` tx, no `status: SETTLED`, no receipt.
 * This guards the worst silent-fail class: UI says "settled" while USDC never
 * left escrow. It also records the screening evidence either way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSb, makeQueue, makeArc, fakeLog } from "./helpers/fakeInfra.js";

const ESCROW = "0x0000000000000000000000000000000000000e5c";

const H = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbHandlers: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbCalls: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arc: null as any,
  // OFAC screen result — mocked so the unit test never hits the network.
  sanctions: {
    available: true,
    sanctioned: false,
    listSize: 86,
    refreshedAt: 1,
  },
  // Sumsub KYB result — mocked (no network).
  kyb: { status: "review" as string, detail: "pending" },
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
  env: { INVOICE_ESCROW_ADDRESS: ESCROW, NODE_ENV: "test" },
}));
vi.mock("../src/ofac.js", () => ({
  checkAddressSanctioned: async () => H.sanctions,
}));
vi.mock("../src/sumsub.js", () => ({
  getVendorKybStatus: async () => H.kyb,
}));

const { startScreenAndSettle } =
  await import("../src/workers/screenAndSettle.js");

const INV = "0x" + "17".repeat(32);

beforeEach(() => {
  H.sbHandlers = {
    screening_results: () => ({ error: null }),
    invoices: (c: { op: string }) =>
      c.op === "select"
        ? { data: { vendor_id: "vend-1" } }
        : { data: null, error: null },
  };
  H.sbCalls = [];
  H.q = makeQueue();
  H.arc = makeArc();
  H.sanctions = { available: true, sanctioned: false, listSize: 86, refreshedAt: 1 };
  H.kyb = { status: "review", detail: "pending" };
});

function run() {
  startScreenAndSettle();
  return H.q.run("screen-and-settle", {
    invoiceId: INV,
    buyerAddress: "0x00000000000000000000000000000000000000b1",
    amount: "1000",
    paidTxHash: "0x" + "fe".repeat(32),
  });
}

describe("screenAndSettle (simulated provider)", () => {
  it("records the 3-of-3 screening evidence bundle", async () => {
    await run();
    const upsert = H.sbCalls.find(
      (c: { table: string; op: string }) =>
        c.table === "screening_results" && c.op === "upsert",
    );
    expect(upsert).toBeTruthy();
    expect((upsert.payload as unknown[]).length).toBe(3);
  });

  it("NEVER settles: no settle tx, no SETTLED status flip", async () => {
    await run();
    expect(H.arc.writes).toHaveLength(0);
    const settled = H.sbCalls.filter(
      (c: { table: string; op: string; payload?: Record<string, unknown> }) =>
        c.table === "invoices" &&
        c.op === "update" &&
        c.payload?.status === "SETTLED",
    );
    expect(settled).toHaveLength(0);
  });

  it("holds for manual review (notify-admin), and emits NO receipt/erp/settled-notify", async () => {
    await run();
    expect(
      H.q.adds.some(
        (a: { queue: string; data: { kind?: string } }) =>
          a.queue === "notify-admin" && a.data.kind === "screening.review",
      ),
    ).toBe(true);
    expect(
      H.q.adds.some((a: { queue: string }) => a.queue === "receipt-generate"),
    ).toBe(false);
    expect(
      H.q.adds.some((a: { queue: string }) => a.queue === "erp-sync"),
    ).toBe(false);
    expect(
      H.q.adds.some(
        (a: { queue: string; data: { kind?: string } }) =>
          a.queue === "notify-vendor" && a.data.kind === "invoice.settled",
      ),
    ).toBe(false);
  });

  it("propagates a DB write error so BullMQ retries (no silent swallow)", async () => {
    H.sbHandlers = {
      screening_results: () => ({ error: new Error("pg down") }),
    };
    await expect(run()).rejects.toThrow(/pg down/);
  });

  it("OFAC match HARD-BLOCKS: sanctions fail → requires_admin_review, no settle, screening.fail", async () => {
    H.sanctions = { available: true, sanctioned: true, listSize: 86, refreshedAt: 1 };
    await run();
    // No settle tx, no SETTLED flip.
    expect(H.arc.writes).toHaveLength(0);
    expect(
      H.sbCalls.filter(
        (c: { table: string; op: string; payload?: Record<string, unknown> }) =>
          c.table === "invoices" &&
          c.op === "update" &&
          c.payload?.status === "SETTLED",
      ),
    ).toHaveLength(0);
    // Flagged for admin review + screening.fail (not screening.review).
    expect(
      H.sbCalls.some(
        (c: { table: string; op: string; payload?: Record<string, unknown> }) =>
          c.table === "invoices" &&
          c.op === "update" &&
          c.payload?.requires_admin_review === true,
      ),
    ).toBe(true);
    expect(
      H.q.adds.some(
        (a: { queue: string; data: { kind?: string } }) =>
          a.queue === "notify-admin" && a.data.kind === "screening.fail",
      ),
    ).toBe(true);
  });
});
