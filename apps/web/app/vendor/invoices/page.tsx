import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { InvoiceTable } from "@/components/klaro/InvoiceTable";
import { MobileShell } from "@/components/klaro/MobileShell";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo so live Supabase
// reads work; previously mock-only.
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { formatUSDC } from "@/lib/money";

/**
 * Vendor invoices list. Mobile = filterable list per designer 03-01.
 * Desktop = redirects to /vendor (where the table already lives).
 */
export default async function VendorInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: "all" | "awaiting" | "paid" }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { vendor } = session;
  const all = await listInvoicesForVendor(vendor.id);
  const { filter = "awaiting" } = await searchParams;

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
    <>
      <div className="md:hidden">
        <MobileShell active="invoices">
          <header>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Invoices
            </h1>
            <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
              {counts.all} issued · {counts.awaiting} awaiting
            </p>
          </header>

          <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-[var(--color-bg-elevated)] p-1">
            <TabLink
              href="/vendor/invoices?filter=all"
              active={filter === "all"}
              label="All"
              n={counts.all}
            />
            <TabLink
              href="/vendor/invoices?filter=awaiting"
              active={filter === "awaiting"}
              label="Awaiting"
              n={counts.awaiting}
            />
            <TabLink
              href="/vendor/invoices?filter=paid"
              active={filter === "paid"}
              label="Paid"
              n={counts.paid}
            />
          </div>

          <ul className="mt-5 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-white">
            {filtered.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={{ pathname: `/vendor/invoices/${inv.id}` }}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className={`mt-1 inline-block size-2 shrink-0 rounded-full ${
                      inv.status === "PAID" || inv.status === "SETTLED"
                        ? "bg-emerald-500"
                        : inv.status === "ACCEPTED"
                          ? "bg-blue-300"
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
                          ? "Awaiting buyer signature"
                          : "Awaiting payment"}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-medium">
                    {formatUSDC(inv.amount)}
                  </p>
                </Link>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--color-ink-subtle)]">
                No invoices in this filter.
              </li>
            ) : null}
          </ul>

          <Link
            href="/vendor/invoices/new"
            className="fixed right-5 bottom-24 z-40 grid h-14 w-14 place-items-center rounded-full bg-[var(--color-ink)] text-2xl text-white shadow-lg hover:bg-black"
            aria-label="New invoice"
          >
            +
          </Link>
        </MobileShell>
      </div>

      <main className="hidden md:block">
        <VendorNav vendorName={vendor.displayName} />
        <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
          <header>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-brand)]">
              Invoices
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              All invoices
            </h1>
          </header>
          <div className="mt-8">
            <InvoiceTable invoices={all} />
          </div>
        </section>
      </main>
    </>
  );
}

function TabLink({
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
      href={{
        pathname: "/vendor/invoices",
        query: { filter: href.split("=")[1] },
      }}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium ${
        active
          ? "bg-white text-[var(--color-ink)] shadow-sm"
          : "text-[var(--color-ink-muted)]"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
        {n}
      </span>
    </Link>
  );
}
