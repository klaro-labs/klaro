import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentSession } from "@/lib/auth";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { formatUSDC, relativeTime } from "@/lib/money";
import { statusDotClass } from "@/lib/statusDot";
import type { InvoiceStatus } from "@/lib/types";

/**
 * Invoices list. AppShell renders the chrome; this page is content-only.
 * One responsive tree — table on desktop, stacked cards on mobile — so we
 * never ship two divergent renderers for the same data.
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

type Filter = "all" | "awaiting" | "paid";

export default async function VendorInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: Filter }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { vendor } = session;
  const all = await listInvoicesForVendor(vendor.id);
  const { filter = "all" } = await searchParams;

  const filtered = all.filter((inv) => {
    if (filter === "all") return true;
    if (filter === "paid")
      return inv.status === "PAID" || inv.status === "SETTLED";
    return inv.status === "CREATED" || inv.status === "ACCEPTED";
  });

  const counts = {
    all: all.length,
    awaiting: all.filter(
      (i) => i.status === "CREATED" || i.status === "ACCEPTED",
    ).length,
    paid: all.filter((i) => i.status === "PAID" || i.status === "SETTLED")
      .length,
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Invoices</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            All invoices
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {counts.all} issued · {counts.awaiting} awaiting · {counts.paid}{" "}
            paid
          </p>
        </div>
        <Link
          href="/vendor/invoices/new"
          className="inline-flex items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)]"
        >
          + New invoice
        </Link>
      </header>

      <div
        className="mt-6 inline-flex rounded-md border border-[var(--color-line)] bg-white p-1"
        role="tablist"
        aria-label="Filter invoices"
      >
        <FilterTab href="/vendor/invoices?filter=all" active={filter === "all"} label="All" n={counts.all} />
        <FilterTab
          href="/vendor/invoices?filter=awaiting"
          active={filter === "awaiting"}
          label="Awaiting"
          n={counts.awaiting}
        />
        <FilterTab
          href="/vendor/invoices?filter=paid"
          active={filter === "paid"}
          label="Paid"
          n={counts.paid}
        />
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          all.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              body="Send your first USDC invoice. Buyers can pay with any wallet, card, or cross-chain — settlement lands in seconds."
              cta={{ href: "/vendor/invoices/new", label: "+ New invoice" }}
            />
          ) : (
            <EmptyState
              title="Nothing in this filter"
              body={`No ${filter} invoices right now. Try a different filter or send a new one.`}
              cta={{ href: "/vendor/invoices?filter=all", label: "Show all" }}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-lg border border-[var(--color-line)] bg-white md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-left text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-subtle)]">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3" aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-[var(--color-line)] last:border-b-0 hover:bg-[var(--color-bg-elevated)]"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {inv.customer.name ?? inv.customer.email}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                          {inv.customer.email}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono">
                        {formatUSDC(inv.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[inv.status]}>
                          {STATUS_LABEL[inv.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-[var(--color-ink-muted)]">
                        {relativeTime(inv.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/vendor/invoices/${inv.id}`}
                          className="text-xs font-medium text-[var(--color-brand)] hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white md:hidden">
              {filtered.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/vendor/invoices/${inv.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className={`mt-1 inline-block size-2 shrink-0 rounded-full ${statusDotClass(inv.status)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {inv.customer.name ?? inv.customer.email}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                        {STATUS_LABEL[inv.status]} ·{" "}
                        {relativeTime(inv.createdAt)}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-medium">
                      {formatUSDC(inv.amount)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function FilterTab({
  href,
  active,
  label,
  n,
}: {
  href: string;
  active: boolean;
  label: string;
  n: number;
}) {
  return (
    <Link
      href={href as Route}
      role="tab"
      aria-selected={active}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--color-bg-elevated)] text-[var(--color-ink)]"
          : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px] text-[var(--color-ink-subtle)]">
        {n}
      </span>
    </Link>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
      <p className="font-display text-lg font-semibold tracking-tight">
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-ink-muted)]">
        {body}
      </p>
      <Link
        href={cta.href as Route}
        className="mt-5 inline-flex items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)]"
      >
        {cta.label}
      </Link>
    </div>
  );
}
