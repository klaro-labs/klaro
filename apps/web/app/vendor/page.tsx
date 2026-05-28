import Link from "next/link";
import type { Route } from "next";
import { BalanceCard } from "@/components/klaro/BalanceCard";
import { InvoiceTable } from "@/components/klaro/InvoiceTable";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockComputeBalances } from "@/lib/mockData";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { isLiveOnChain } from "@/lib/arcClient";
import { formatUSDC, relativeTime } from "@/lib/money";

/**
 * Vendor dashboard. AppShell (vendor/layout.tsx) renders the sidebar +
 * topbar + mobile tabs around this. The session guard already runs there;
 * we re-fetch session here for the `simulated` flag + display fields and
 * trust the layout's redirect to gate access.
 */
const ERROR_BANNERS: Record<string, { title: string; body: string }> = {
  operator_role_required: {
    title: "Admin access requires the operator role",
    body: "Your account is a vendor. Operator console / internal pages are restricted to Klaro operators. Contact ops@klaro.so if you believe you should have access.",
  },
  wallet_not_provisioned: {
    title: "Wallet not yet provisioned",
    body: "We couldn't find a Circle Wallets payout address on your account. Complete provisioning in Settings → Payout.",
  },
};

export default async function VendorOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const banner = params?.error ? ERROR_BANNERS[params.error] : null;
  const session = await getCurrentSession();
  // Layout already redirects unauthenticated users; this null-check keeps
  // the type narrow without a second redirect.
  if (!session) return null;

  const { vendor, simulated } = session;
  const invoices = await listInvoicesForVendor(vendor.id);
  const balances = mockComputeBalances(invoices);
  const recent = invoices.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-10">
      {banner && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{banner.title}</p>
          <p className="mt-1 text-sm text-amber-900/80">{banner.body}</p>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {simulated ? (
            <Badge tone="sim">Simulated session</Badge>
          ) : null}
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Welcome back, {vendor.displayName.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} ·{" "}
            {isLiveOnChain() ? "Live on Arc testnet" : "Simulator"} · Wallet{" "}
            {vendor.wallet
              ? `${vendor.wallet.slice(0, 6)}…${vendor.wallet.slice(-4)}`
              : "Not yet provisioned"}
          </p>
        </div>
        <Link
          href="/vendor/invoices/new"
          className="inline-flex items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)] md:hidden"
        >
          + New invoice
        </Link>
      </header>

      <div className="mt-8">
        <BalanceCard balances={balances} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Invoices
            </h2>
            <Link
              href="/vendor/invoices"
              className="text-xs font-medium text-[var(--color-brand)] hover:underline"
            >
              View all →
            </Link>
          </div>
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              body="Send your first USDC invoice. Buyers can pay with any wallet, card, or cross-chain."
              cta={{ href: "/vendor/invoices/new", label: "+ New invoice" }}
            />
          ) : (
            <InvoiceTable invoices={invoices} />
          )}
        </section>

        <aside>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            Recent activity
          </h2>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-6 text-center text-sm text-[var(--color-ink-muted)]">
              Once you send an invoice, the timeline shows up here.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
              {recent.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${
                      inv.status === "PAID" || inv.status === "SETTLED"
                        ? "bg-emerald-500"
                        : inv.status === "ACCEPTED"
                          ? "bg-[var(--color-brand)]"
                          : "bg-amber-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {inv.customer.name ?? inv.customer.email}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                      {inv.status === "PAID" || inv.status === "SETTLED"
                        ? "Paid"
                        : inv.status === "ACCEPTED"
                          ? "Waiting on buyer"
                          : "Sent"}{" "}
                      · {relativeTime(inv.createdAt)}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-medium">
                    {formatUSDC(inv.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
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
