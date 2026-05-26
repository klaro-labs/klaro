/**
 * Tax pack + audit pack exports. v2 §29 + #22, #28.
 * Pure functions that build CSV / JSON strings from in-memory data. No I/O,
 * no env reads — call sites handle the download response. Lets the same code
 * power: vendor download, daemon scheduled export, admin audit pull.
 * PDF rendering (vendor-letterhead with brand + line items) lands M12 polish.
 */

import type { Invoice, CashoutOrder, Vendor } from "./types";

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Tax pack: settled invoices in a window, with totals + counterparty + screening hash. */
export function buildTaxPackCsv(opts: {
  invoices: Invoice[];
  from: Date;
  to: Date;
}): string {
  const inv = opts.invoices.filter(
    (i) =>
      i.status === "SETTLED" &&
      +i.createdAt >= +opts.from &&
      +i.createdAt <= +opts.to,
  );
  const header = [
    "invoice_id",
    "settled_at",
    "amount_usdc",
    "customer_email",
    "customer_name",
    "metadata_hash",
    "receipt_hash",
    "vendor_wallet",
  ].join(",");
  const rows = inv.map((i) =>
    [
      i.id,
      i.createdAt.toISOString(),
      (Number(i.amount) / 1_000_000).toFixed(6),
      csvEscape(i.customer.email),
      csvEscape(i.customer.name ?? ""),
      i.metadataHash,
      i.receiptHash ?? "",
      // i.vendorWallet is `Hex | null` after .
      // Empty string for missing wallet keeps CSV importers (Excel,
      // QuickBooks) from reading literal "null" as a value.
      i.vendorWallet ?? "",
    ].join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

export function taxPackSummary(opts: {
  invoices: Invoice[];
  from: Date;
  to: Date;
}): {
  count: number;
  totalUsdc: bigint;
  uniqueCustomers: number;
  windowDays: number;
} {
  const inv = opts.invoices.filter(
    (i) =>
      i.status === "SETTLED" &&
      +i.createdAt >= +opts.from &&
      +i.createdAt <= +opts.to,
  );
  const totalUsdc = inv.reduce((acc, i) => acc + i.amount, 0n);
  const uniqueCustomers = new Set(inv.map((i) => i.customer.email)).size;
  const windowDays = Math.max(
    1,
    Math.round((+opts.to - +opts.from) / 86_400_000),
  );
  return { count: inv.length, totalUsdc, uniqueCustomers, windowDays };
}

/** Full audit pack — every invoice + every cashout + vendor profile + chain refs. */
export function buildAuditPackJson(opts: {
  vendor: Vendor;
  invoices: Invoice[];
  cashouts: CashoutOrder[];
  generatedAt?: Date;
}): string {
  const payload = {
    schemaVersion: "klaro.audit-pack.v1",
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    vendor: {
      id: opts.vendor.id,
      displayName: opts.vendor.displayName,
      country: opts.vendor.country,
      // opts.vendor.wallet is `Hex | null` after .
      // Same honest-labeling pattern as privacy export — consumers
      // (accountants, regulators) get an explicit walletStatus instead
      // of having to interpret `null` as a meaningful value.
      wallet: opts.vendor.wallet ?? undefined,
      walletStatus: opts.vendor.wallet ? "provisioned" : "not_yet_provisioned",
      invoiceTemplateVersion: opts.vendor.invoiceTemplateVersion ?? 1,
    },
    invoices: opts.invoices.map((i) => ({
      id: i.id,
      status: i.status,
      amountUsdc: i.amount.toString(),
      dueAt: i.dueAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      customer: { email: i.customer.email, name: i.customer.name ?? null },
      metadataHash: i.metadataHash,
      receiptHash: i.receiptHash ?? null,
      acceptanceSig: i.acceptanceSig ?? null,
      acceptedBy: i.acceptedBy ?? null,
      paidTx: i.paidTx ?? null,
      settledTx: i.settledTx ?? null,
    })),
    cashouts: opts.cashouts.map((c) => ({
      id: c.id,
      status: c.status,
      usdcAmount: c.usdcAmount.toString(),
      payoutMinor: c.payoutMinor.toString(),
      currency: c.currency,
      quoteHash: c.quoteHash,
      proofHash: c.proofHash ?? null,
      lpId: c.lpId ?? null,
      timeline: c.timeline.map((e) => ({
        kind: e.kind,
        at: e.at.toISOString(),
        detail: e.detail ?? null,
      })),
    })),
    totals: {
      invoiceCount: opts.invoices.length,
      settledCount: opts.invoices.filter((i) => i.status === "SETTLED").length,
      cashoutCount: opts.cashouts.length,
      releasedCashouts: opts.cashouts.filter(
        (c) => c.status === "RELEASED" || c.status === "CONFIRMED",
      ).length,
    },
  };
  return JSON.stringify(payload, null, 2);
}
