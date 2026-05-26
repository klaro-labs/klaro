import Link from "next/link";
import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { mockListDisputesAll } from "@/lib/mockData";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";

export const metadata = { title: "Case management · Klaro admin" };

const STATUS_TONE: Record<string, "info" | "sim" | "live" | "neutral"> = {
  OPENED: "info",
  EVIDENCE: "info",
  UNDER_REVIEW: "sim",
  DECIDED: "live",
};

export default async function AdminCaseManagementPage() {
  const cases = await mockListDisputesAll();
  const open = cases.filter((c) => c.status !== "DECIDED");
  const decided = cases.filter((c) => c.status === "DECIDED");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Admin · v2 §29.4
          </p>
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
          <Tile label="Open" value={open.length} tone="sim" />
          <Tile label="Decided" value={decided.length} tone="live" />
          <Tile
            label="SLA breaches"
            value={
              open.filter((c) => Date.now() - +c.openedAt > 24 * 3600_000)
                .length
            }
            tone="sim"
          />
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Open cases</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            No open cases.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
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
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                <span className="text-sm">{formatUSDC(c.amountUsdc)}</span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(c.openedAt)}
                </span>
                <Link
                  href={`/admin/disputes`}
                  className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--color-brand)]"
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

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "live" | "sim" | "info";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-display text-3xl font-semibold">{value}</span>
        <Badge tone={tone}>cases</Badge>
      </div>
    </div>
  );
}
