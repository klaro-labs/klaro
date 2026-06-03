import Link from "next/link";
import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatTile } from "@/components/ui/StatTile";
import { listAll } from "@/lib/repo/disputes";
import { DISPUTE_STATUS_TONE, disputeStatusLabel } from "@/lib/disputeStatus";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";

export const metadata = { title: "Case management · Klaro admin" };

export default async function AdminCaseManagementPage() {
  const cases = await listAll();
  const open = cases.filter((c) => c.status !== "DECIDED");
  const decided = cases.filter((c) => c.status === "DECIDED");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6">
          <Eyebrow>Admin · Case management</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Case management
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            Every dispute, end-to-end. SLA: 24h from OPEN → DECIDED. Outcomes
            write back on-chain via DisputeManager.decide() → consumer contract
            refund.
          </p>
        </header>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <StatTile label="Open" value={String(open.length)} sub="cases" />
          <StatTile
            label="Decided"
            value={String(decided.length)}
            sub="cases"
          />
          <StatTile
            label="SLA breaches"
            value={String(
              open.filter((c) => Date.now() - +c.openedAt > 24 * 3600_000)
                .length,
            )}
            sub="cases"
          />
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Open cases</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8 text-sm text-[var(--color-ink-muted)]">
            No open cases.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
            {open.map((c) => (
              <li
                key={c.caseId}
                className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.6fr_auto_auto_auto_auto] md:items-center"
              >
                <Link href={`/admin/disputes`} className="hover:underline">
                  <div className="font-medium">
                    {c.claimantLabel} vs {c.respondentLabel}
                  </div>
                  <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                    {shortAddress(c.caseId)}
                  </div>
                </Link>
                <Badge tone={DISPUTE_STATUS_TONE[c.status]}>
                  {disputeStatusLabel(c.status)}
                </Badge>
                <span className="text-sm">{formatUSDC(c.amountUsdc)}</span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(c.openedAt)}
                </span>
                <Link
                  href={`/admin/disputes`}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs transition-colors hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
