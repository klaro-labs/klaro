// Regression for loop (2026-05-25): the /api/v1/invoices/[id] GET
// previously returned the full Invoice payload — including
// `customer.email` and `customer.name`. The route is now vendor-authed
// (buyer-facing access goes through /i/[id]) and strips the customer
// block to presence flags. We mock a matching vendor session so the
// ownership check passes and the redaction path is exercised.

import { describe, it, expect, vi } from "vitest";
import type { Hex } from "@/lib/types";

const SEED_INVOICE = {
  id: ("0x" + "ab".repeat(32)) as Hex,
  vendorId: "vendor-asha",
  vendorWallet: ("0x" + "11".repeat(20)) as Hex,
  token: ("0x" + "22".repeat(20)) as Hex,
  amount: 1_000_000n,
  dueAt: new Date("2026-06-01"),
  status: "DRAFT" as const,
  customer: { email: "buyer@example.com", name: "Acme Inc" },
  lineItems: [{ description: "retainer", amountUsdc: 1_000_000n }],
  metadataHash: ("0x" + "33".repeat(32)) as Hex,
  createdAt: new Date("2026-05-01"),
};

vi.mock("@/lib/auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...real,
    requireVendor: vi.fn(async () => ({
      vendor: {
        id: "vendor-asha",
        displayName: "Asha",
        wallet: ("0x" + "11".repeat(20)) as Hex,
        country: "IN",
      },
    })),
  };
});

vi.mock("@/lib/sentry", () => ({ captureError: vi.fn() }));

vi.mock("@/lib/repo/invoices", () => ({
  getInvoice: vi.fn(async () => SEED_INVOICE),
}));

describe("/api/v1/invoices/[id] PII redaction", () => {
  it("strips customer.email and customer.name from the public payload", async () => {
    const { GET } = await import("@/app/api/v1/invoices/[id]/route");
    const res = await GET(new Request("http://x/" + SEED_INVOICE.id), {
      params: Promise.resolve({ id: SEED_INVOICE.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice).toBeDefined();
    expect(body.invoice.customer).toEqual({ hasEmail: true, hasName: true });
    // belt-and-suspenders: stringify the entire payload and confirm the
    // raw PII never appears anywhere in it.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("buyer@example.com");
    expect(raw).not.toContain("Acme Inc");
  });

  it("404s when the invoice does not exist", async () => {
    const repo = await import("@/lib/repo/invoices");
    (repo.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/v1/invoices/[id]/route");
    const res = await GET(new Request("http://x/missing"), {
      params: Promise.resolve({ id: "0xdead" }),
    });
    expect(res.status).toBe(404);
  });
});
