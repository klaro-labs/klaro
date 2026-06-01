/**
 * createInvoice live-path atomicity. The invoice row + its line items are two
 * separate inserts (Supabase JS has no multi-statement tx). If the line-items
 * insert fails we must NOT strand an orphan invoice — the code compensates by
 * deleting the just-inserted invoice and throwing. If that cleanup ALSO fails,
 * both errors must surface (never a silent orphan). These tests pin both paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal chainable Supabase fake. Records ops so we can assert the
// compensating delete fired, and lets each test inject per-table results.
type Result = { data?: unknown; error: { message: string } | null };
const state = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: null as any,
}));

vi.mock("@/lib/db", () => ({ tryDb: async () => state.client }));

const { createInvoice } = await import("@/lib/repo/invoices");

function makeClient(opts: {
  invoiceInsert: Result;
  lineItemsInsert: Result;
  invoiceDelete: Result;
}) {
  const ops: { op: string; table: string; detail?: unknown }[] = [];
  const client = {
    ops,
    from(table: string) {
      return {
        insert(payload: unknown) {
          ops.push({ op: "insert", table, detail: payload });
          const result =
            table === "invoices" ? opts.invoiceInsert : opts.lineItemsInsert;
          // Awaitable directly (line_items path) AND chainable to
          // .select().single() (invoices path).
          return {
            select: () => ({ single: () => Promise.resolve(result) }),
            then: (resolve: (r: Result) => void) => resolve(result),
          };
        },
        delete() {
          return {
            eq: (col: string, val: unknown) => {
              ops.push({ op: "delete", table, detail: { col, val } });
              return Promise.resolve(opts.invoiceDelete);
            },
          };
        },
      };
    },
  };
  return client;
}

const baseArgs = {
  id: ("0x" + "ab".repeat(32)) as `0x${string}`,
  vendorId: "vendor-1",
  vendorWallet: ("0x" + "11".repeat(20)) as `0x${string}`,
  amountUsdc: 1_000_000n,
  token: ("0x" + "22".repeat(20)) as `0x${string}`,
  dueAt: new Date("2026-07-01T00:00:00Z"),
  customer: { email: "buyer@example.com", name: "Buyer" },
  lineItems: [{ description: "Design work", amount: 1_000_000n }],
  metadataHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
};

const okInsert: Result = { data: { id: baseArgs.id }, error: null };
const ok: Result = { error: null };

beforeEach(() => {
  state.client = null;
});

describe("createInvoice live-path atomicity", () => {
  it("deletes the orphan invoice and throws when line-items insert fails", async () => {
    state.client = makeClient({
      invoiceInsert: okInsert,
      lineItemsInsert: { error: { message: "items_boom" } },
      invoiceDelete: ok,
    });

    await expect(createInvoice(baseArgs)).rejects.toThrow(/items_boom/);

    // the compensating delete fired against the just-inserted invoice id
    const del = state.client.ops.find(
      (o: { op: string; table: string }) =>
        o.op === "delete" && o.table === "invoices",
    );
    expect(del).toBeTruthy();
    expect((del.detail as { val: string }).val).toBe(baseArgs.id);
  });

  it("surfaces BOTH errors (never a silent orphan) when cleanup also fails", async () => {
    state.client = makeClient({
      invoiceInsert: okInsert,
      lineItemsInsert: { error: { message: "items_boom" } },
      invoiceDelete: { error: { message: "delete_boom" } },
    });

    await expect(createInvoice(baseArgs)).rejects.toThrow(
      /items_boom[\s\S]*delete_boom[\s\S]*manual removal/,
    );
  });

  it("does not delete anything when there are no line items", async () => {
    state.client = makeClient({
      invoiceInsert: okInsert,
      lineItemsInsert: ok,
      invoiceDelete: ok,
    });

    await createInvoice({ ...baseArgs, lineItems: [] });

    const del = state.client.ops.find((o: { op: string }) => o.op === "delete");
    expect(del).toBeUndefined();
  });
});
