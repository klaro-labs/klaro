// Regression for loop iters 24 + 31 (2026-05-25):
// fixed the lifecycle-reminder cron so the email subject's
// `vendorName` came from the real vendor (resolved via `mockGetVendor`),
// not from `inv.customer.name` (the buyer). It added a per-vendor name
// cache to avoid re-fetching the same vendor for every invoice.
// fixed the cron's input: it used to walk `mockListInvoices(
// "vendor-asha")` — single-vendor only — so the cache benefit was
// unrealized. Now uses `mockListAllInvoices()` matching the live path.
// This test exercises both fixes by seeding invoices for TWO vendors and
// asserting (a) each email's vendorName matches the right vendor (not the
// buyer), (b) `mockGetVendor` is called once per unique vendor, not once
// per invoice (cache works).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { keccak256, stringToBytes } from "viem";
import type { Hex } from "@/lib/types";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

// Snapshot of the calls the cron makes — assertion targets.
const sentReminders: Array<{ vendorName: string; buyerEmail: string }> = [];
const vendorLookupIds: string[] = [];

vi.mock("@/lib/email", () => ({
  sendLifecycleReminder: vi.fn(
    async (opts: { vendorName: string; buyerEmail: string }) => {
      sentReminders.push({
        vendorName: opts.vendorName,
        buyerEmail: opts.buyerEmail,
      });
    },
  ),
}));

vi.mock("@/lib/featureFlags", () => ({
  isFlagOn: vi.fn(async () => true),
}));

// Spy on the dual-mode vendor repo function the cron uses.
// swapped from mockGetVendor → getVendorById so live mode resolves real
// vendor rows; the test mock follows the consumer.
vi.mock("@/lib/repo/vendors", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/repo/vendors")>(
      "@/lib/repo/vendors",
    );
  return {
    ...real,
    getVendorById: vi.fn(async (id: string) => {
      vendorLookupIds.push(id);
      return real.getVendorById(id);
    }),
  };
});

describe("lifecycle-reminder cron — multi-vendor + cache", () => {
  it("uses each invoice's own vendor for the email subject, and caches lookups", async () => {
    sentReminders.length = 0;
    vendorLookupIds.length = 0;

    const mocked = await import("@/lib/mockData");
    const vendorsRepo = await import("@/lib/repo/vendors");

    // Seed a second vendor alongside the default Asha.
    const otherVendorId = "vendor-other-test-31";
    // Stub getVendorById to return synthetic vendors for both ids;
    // routed the cron through this dual-mode entry point.
    (vendorsRepo.getVendorById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => {
        vendorLookupIds.push(id);
        if (id === "vendor-asha") {
          return {
            id: "vendor-asha",
            email: "a@klaro.demo",
            displayName: "Asha Pune",
            wallet: ("0x" + "11".repeat(20)) as Hex,
            createdAt: new Date(),
          };
        }
        if (id === otherVendorId) {
          return {
            id: otherVendorId,
            email: "b@klaro.demo",
            displayName: "Beta Vendor",
            wallet: ("0x" + "22".repeat(20)) as Hex,
            createdAt: new Date(),
          };
        }
        return null;
      },
    );

    // Seed 3 invoices — 2 for Asha + 1 for the new vendor. All due in 3
    // days so they hit the `due_3d` reminder window. Buyer's name set
    // distinctly so we can verify the cron does NOT use it as vendorName.
    const dueIn3Days = new Date(Date.now() + 3 * 86_400_000);
    for (let i = 0; i < 2; i++) {
      await mocked.mockCreateInvoice({
        vendorId: "vendor-asha",
        vendorWallet: ("0x" + "aa".repeat(20)) as Hex,
        token: ("0x" + "bb".repeat(20)) as Hex,
        amount: 1_000_000n,
        dueAt: dueIn3Days,
        customer: {
          email: `buyer-asha-${i}@example.com`,
          name: "DEFINITELY NOT THE VENDOR NAME",
        },
        lineItems: [{ description: "x", amount: 1_000_000n }],
        id: `0x${"a".repeat(63)}${i}` as Hex,
        metadataHash: keccak256(stringToBytes(`m-asha-${i}`)),
      });
    }
    await mocked.mockCreateInvoice({
      vendorId: otherVendorId,
      vendorWallet: ("0x" + "cc".repeat(20)) as Hex,
      token: ("0x" + "bb".repeat(20)) as Hex,
      amount: 2_500_000n,
      dueAt: dueIn3Days,
      customer: { email: "buyer-beta@example.com", name: "ANOTHER WRONG NAME" },
      lineItems: [{ description: "y", amount: 2_500_000n }],
      id: `0x${"b".repeat(64)}` as Hex,
      metadataHash: keccak256(stringToBytes("m-beta")),
    });

    const { GET } = await import("@/app/api/cron/lifecycle-reminders/route");
    const res = await GET(
      new Request("http://x/cron") as unknown as Parameters<typeof GET>[0],
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sent).toBeGreaterThanOrEqual(3);

    // No reminder should use the buyer's name as the vendor brand.
    for (const r of sentReminders) {
      expect(r.vendorName).not.toMatch(/DEFINITELY NOT|ANOTHER WRONG/);
    }
    // Each vendor's invoices use the correct vendor displayName.
    const ashaReminders = sentReminders.filter((r) =>
      r.buyerEmail.startsWith("buyer-asha-"),
    );
    const betaReminders = sentReminders.filter(
      (r) => r.buyerEmail === "buyer-beta@example.com",
    );
    expect(ashaReminders.length).toBeGreaterThanOrEqual(2);
    expect(betaReminders.length).toBeGreaterThanOrEqual(1);
    for (const r of ashaReminders) expect(r.vendorName).toBe("Asha Pune");
    for (const r of betaReminders) expect(r.vendorName).toBe("Beta Vendor");

    // Per-vendor cache: 2 unique vendorIds → at most 2 lookups, regardless
    // of how many invoices each has. Cache from must be working.
    const uniqueLookups = new Set(vendorLookupIds);
    expect(uniqueLookups.size).toBeLessThanOrEqual(2);
    // And we shouldn't have called mockGetVendor 3+ times (one per invoice).
    expect(vendorLookupIds.length).toBeLessThanOrEqual(2);
  });

  // QA-070: pre-fix one sendLifecycleReminder throw aborted the entire
  // loop and silently dropped every subsequent invoice. Per-iteration
  // try/catch now isolates failures + surfaces a `failed` counter.
  it("isolates per-invoice failures so one bad email doesn't drop the rest (QA-070)", async () => {
    sentReminders.length = 0;
    vendorLookupIds.length = 0;

    const mocked = await import("@/lib/mockData");
    const vendorsRepo = await import("@/lib/repo/vendors");
    const emailModule = await import("@/lib/email");

    (vendorsRepo.getVendorById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => ({
        id,
        email: `${id}@klaro.demo`,
        displayName: `Vendor ${id.slice(-1)}`,
        wallet: ("0x" + "00".repeat(20)) as Hex,
        createdAt: new Date(),
      }),
    );

    // Make the 2nd email send throw to simulate SES rate-limit / bad-address.
    let callCount = 0;
    (
      emailModule.sendLifecycleReminder as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async (opts: { vendorName: string; buyerEmail: string }) => {
        callCount += 1;
        if (callCount === 2) throw new Error("SES rate-limit (simulated)");
        sentReminders.push({
          vendorName: opts.vendorName,
          buyerEmail: opts.buyerEmail,
        });
      },
    );

    const dueIn3Days = new Date(Date.now() + 3 * 86_400_000);
    for (let i = 0; i < 3; i++) {
      await mocked.mockCreateInvoice({
        vendorId: `vendor-qa070-${i}`,
        vendorWallet: ("0x" + "dd".repeat(20)) as Hex,
        token: ("0x" + "bb".repeat(20)) as Hex,
        amount: 1_000_000n,
        dueAt: dueIn3Days,
        customer: { email: `buyer-qa070-${i}@example.com`, name: `Buyer ${i}` },
        lineItems: [{ description: "z", amount: 1_000_000n }],
        id: `0x${"c".repeat(63)}${i}` as Hex,
        metadataHash: keccak256(stringToBytes(`m-qa070-${i}`)),
      });
    }

    const { GET } = await import("@/app/api/cron/lifecycle-reminders/route");
    const res = await GET(
      new Request("http://x/cron") as unknown as Parameters<typeof GET>[0],
    );
    const body = await res.json();

    // Loop did NOT abort on the throw — response still ok.
    expect(body.ok).toBe(true);
    // Pre-fix: callCount would have been 2 (loop dies after the throw).
    // Post-fix: every invoice gets attempted.
    expect(callCount).toBeGreaterThanOrEqual(3);
    // `failed` counter exposed in response so operators see partial-batch.
    expect(body.failed).toBeGreaterThanOrEqual(1);
    // At least one of the THREE QA-070 invoices' send did succeed
    // (call 1 + call 3 by mock contract).
    const qa070Sent = sentReminders.filter((r) =>
      r.buyerEmail.startsWith("buyer-qa070-"),
    );
    expect(qa070Sent.length).toBeGreaterThanOrEqual(2);
  });
});
