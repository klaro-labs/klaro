import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/types";

/**
 * InvoiceTable — vendor's invoice list with status pills + amount + customer +
 * due date. Sorts newest first. Empty state included.
 */

const STATUS_TONE: Record<
  InvoiceStatus,
  "live" | "info" | "neutral" | "sim" | "verified"
> = {
  CREATED: "neutral",
  ACCEPTED: "info",
  PAID: "info",
  SETTLED: "live",
  REFUNDED: "sim",
  CANCELLED: "sim",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  CREATED: "Awaiting buyer",
  ACCEPTED: "Signed",
  PAID: "Paid · settling",
  SETTLED: "Settled",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg)] p-10 text-center">
        <p className="font-display text-base font-semibold">No invoices yet.</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Create your first one to see it here.
        </p>
        <Link
          href="/vendor/invoices/new"
          className="mt-5 inline-flex items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 py-2 text-sm font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)]"
        >
          Create invoice →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--color-line)] bg-[var(--color-bg)]">
          <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            <th className="px-5 py-3 text-left">Customer</th>
            <th className="px-5 py-3 text-left">Description</th>
            <th className="px-5 py-3 text-right">Amount</th>
            <th className="px-5 py-3 text-left">Status</th>
            <th className="px-5 py-3 text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-[var(--color-line)] last:border-b-0 hover:bg-[var(--color-bg)]"
            >
              <td className="px-5 py-3">
                <Link
                  href={`/vendor/invoices/${inv.id}`}
                  className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]"
                >
                  {inv.customer.name ?? inv.customer.email}
                </Link>
                <p className="text-xs text-[var(--color-ink-subtle)]">
                  {inv.customer.email}
                </p>
              </td>
              <td className="px-5 py-3 text-[var(--color-ink-muted)]">
                {inv.lineItems[0]?.description ?? "—"}
              </td>
              <td className="px-5 py-3 text-right font-medium text-[var(--color-ink)]">
                {formatUSDC(inv.amount)}
              </td>
              <td className="px-5 py-3">
                <Badge tone={STATUS_TONE[inv.status]}>
                  {STATUS_LABEL[inv.status]}
                </Badge>
                {inv.status === "SETTLED" && inv.receiptHash ? (
                  <p className="mt-1 text-[11px] font-mono text-[var(--color-ink-subtle)]">
                    {shortAddress(inv.receiptHash)}
                  </p>
                ) : null}
              </td>
              <td className="px-5 py-3 text-right text-xs text-[var(--color-ink-muted)]">
                {relativeTime(inv.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
