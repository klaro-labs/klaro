import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockListBills } from "@/lib/mockData";
import { getT } from "@/lib/i18n";
import { formatUSDC, relativeTime } from "@/lib/money";

export default async function BillsPage() {
  const t = await getT();
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const bills = await mockListBills(session.vendor.id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              {t("bills.title")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {t("bills.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              {t("bills.description")}
            </p>
          </div>
          <Badge tone="sim">M5 · pay-bills pilot</Badge>
        </div>

        <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
          <h2 className="font-display text-lg font-semibold">
            What ships next
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>
              Receive USDC bills from other Klaro vendors (one-click pay).
            </li>
            <li>
              Schedule outbound payments — funds locked, released on due date.
            </li>
            <li>Approval workflow for team members (RBAC arrives M8).</li>
            <li>
              Auto-reconciliation against vendor invoices in ERP integrations.
            </li>
          </ul>

          <h2 className="mt-6 font-display text-lg font-semibold">
            Existing bills
          </h2>
          {bills.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {t("bills.comingSoon")}
            </p>
          ) : (
            // list rows were plain text — no way to
            // open a bill. Each row is now a Link to /vendor/bills/[id] where
            // the pay/approve flow lives.
            <ul className="mt-3 divide-y divide-[var(--color-line)]">
              {bills.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/vendor/bills/${b.id}`}
                    className="flex items-center justify-between py-3 text-sm hover:bg-[var(--color-bg)]"
                  >
                    <span className="font-medium">{b.fromName}</span>
                    <span className="text-[var(--color-ink-muted)]">
                      {b.description}
                    </span>
                    <span className="font-mono">
                      {formatUSDC(b.amountUsdc)} USDC
                    </span>
                    <span className="text-xs text-[var(--color-ink-subtle)]">
                      due {relativeTime(b.dueAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
