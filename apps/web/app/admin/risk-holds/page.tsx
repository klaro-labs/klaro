import Link from "next/link";
import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { mockAdminQueueItems } from "@/lib/mockData";
import { formatUSDC, shortAddress, relativeTime } from "@/lib/money";

export const metadata = { title: "Risk holds · Klaro admin" };

export default async function AdminRiskHoldsPage() {
  const frozen = await mockAdminQueueItems("frozen");
  const lockedOut = await mockAdminQueueItems("locked-out");
  const subStake = await mockAdminQueueItems("sub-stake-lp");
  const all = [...frozen, ...lockedOut, ...subStake];

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Admin · Risk holds
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Risk holds
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            Frozen orders, locked-out vendors, sub-threshold LPs. Holds expire
            automatically when the underlying condition resolves; operator may
            release early with a ReasonCode.
          </p>
        </header>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <StatTile label="Frozen orders" count={frozen.length} tone="sim" />
          <StatTile
            label="Locked-out vendors"
            count={lockedOut.length}
            tone="sim"
          />
          <StatTile label="Sub-stake LPs" count={subStake.length} tone="info" />
        </div>

        {all.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            No active holds. Daemon writes here when a cashout is frozen for
            verifier review, a vendor trips re-KYC, or an LP&apos;s stake drops
            below tier.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {all.map((it) => (
              <li
                key={`${it.kind}-${it.id}`}
                className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.6fr_auto_auto_auto] md:items-center"
              >
                <Link href={it.href as never} className="hover:underline">
                  <div className="font-medium">{it.label}</div>
                  <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                    {shortAddress(it.id as `0x${string}`)}
                  </div>
                </Link>
                <Badge tone="sim">{it.kind.replace("-", " ")}</Badge>
                {it.amountUsdc !== undefined ? (
                  <span className="text-sm">{formatUSDC(it.amountUsdc)}</span>
                ) : (
                  <span />
                )}
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(it.openedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "sim" | "info" | "live";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Badge tone={tone}>{count}</Badge>
      </div>
    </div>
  );
}
