import Link from "next/link";
import { VendorNav } from "@/components/klaro/VendorNav";
import { BalanceCard } from "@/components/klaro/BalanceCard";
import { InvoiceTable } from "@/components/klaro/InvoiceTable";
import { MobileShell } from "@/components/klaro/MobileShell";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
// swapped direct `mockListInvoices`
// → dual-mode `listInvoicesForVendor` so the dashboard reads real Supabase
// rows in live mode instead of the seeded-Asha mock list. `mockComputeBalances`
// stays — it's a pure-data reducer (sum/filter) with no IO.
import { mockComputeBalances } from "@/lib/mockData";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { isLiveOnChain } from "@/lib/arcClient";
import { formatUSDC, relativeTime } from "@/lib/money";

/**
 * Vendor dashboard — `app.klaro.so` equivalent at `/vendor`.
 * Auth: hits the env-gated `auth` adapter (real Supabase if configured,
 * mock vendor otherwise). Surfaces a "Simulated session" pill when the
 * mock path is active so reviewers know which mode they're in
 * (: no silent mock/live mixing).
 */
/** Map a redirect `?error=` code to a user-visible banner. Audit fix (loop
 * , 2026-05-25): `app/admin/layout.tsx` redirects non-operator vendors
 * here with `?error=operator_role_required` but nothing displayed the cause —
 * the user landed silently and didn't know why. */
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
  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-32 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">
          You're not signed in.{" "}
          <Link
            href="/signin"
            className="text-[var(--color-brand)] hover:underline"
          >
            Sign in →
          </Link>
        </p>
      </main>
    );
  }

  const { vendor, simulated } = session;
  const invoices = await listInvoicesForVendor(vendor.id);
  const balances = mockComputeBalances(invoices);

  return (
    <>
      {/* ─── MOBILE (<md) — dark balance card + 2 actions + Recent list + bottom-nav ─── */}
      <div className="md:hidden">
        <MobileShell active="home">
          {banner && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                {banner.title}
              </p>
              <p className="mt-1 text-xs text-amber-900/80">{banner.body}</p>
            </div>
          )}
          <header className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Hi, {vendor.displayName.split(" ")[0]}
            </h1>
            {simulated ? <Badge tone="sim">Sim</Badge> : null}
          </header>

          <article className="relative mt-4 overflow-hidden rounded-2xl bg-[var(--color-ink)] p-5 text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-8 h-44 w-44 rounded-full bg-[var(--color-brand)] opacity-25 blur-3xl"
            />
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/60">
                Balance
              </p>
              <span className="inline-flex items-center gap-1 rounded-pill bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" />{" "}
                {simulated ? "Testnet demo" : "Live"}
              </span>
            </div>
            <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
              {formatUSDC(balances.available)}
            </p>
            <p className="mt-1 font-mono text-xs text-white/55">
              ≈ ₹
              {((Number(balances.available) / 1_000_000) * 83.4).toLocaleString(
                "en-IN",
                { maximumFractionDigits: 0 },
              )}{" "}
              INR
            </p>
          </article>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/vendor/invoices/new"
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white py-3 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
            >
              + New invoice
            </Link>
            <Link
              href="/vendor/cashout"
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white py-3 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
            >
              ↗ Cash out
            </Link>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-base font-semibold tracking-tight">
                Recent
              </h2>
              <Link
                href="/vendor/invoices/new"
                className="text-xs font-medium text-[var(--color-brand)]"
              >
                See all
              </Link>
            </div>
            <ul className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-white">
              {invoices.slice(0, 3).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className={`mt-1 inline-block size-2 shrink-0 rounded-full ${inv.status === "PAID" || inv.status === "SETTLED" ? "bg-emerald-500" : inv.status === "ACCEPTED" ? "bg-blue-300" : "bg-amber-400"}`}
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
                    +{formatUSDC(inv.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </MobileShell>
      </div>

      {/* ─── DESKTOP (≥md) — existing layout ─── */}
      <main className="hidden md:block">
        <VendorNav vendorName={vendor.displayName} />

        <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
          {banner && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                {banner.title}
              </p>
              <p className="mt-1 text-sm text-amber-900/80">{banner.body}</p>
            </div>
          )}
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-brand)]">
                  Overview
                </p>
                {simulated ? (
                  <Badge tone="sim">
                    Simulated session · Supabase env not set
                  </Badge>
                ) : null}
              </div>
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
              className="inline-flex items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)]"
            >
              + New invoice
            </Link>
          </header>

          <div className="mt-8">
            <BalanceCard balances={balances} />
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Invoices
              </h2>
              <span className="text-xs text-[var(--color-ink-subtle)]">
                Showing {invoices.length}
              </span>
            </div>
            <InvoiceTable invoices={invoices} />
          </div>
        </section>
      </main>
    </>
  );
}
