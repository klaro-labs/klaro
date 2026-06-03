import Link from "next/link";
import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { mockAdminQueueItems } from "@/lib/mockData";
import { SEVERITY_TONE } from "@/lib/severityTone";
import { formatUSDC, shortAddress, relativeTime } from "@/lib/money";

export const metadata = { title: "Manual review · Klaro admin" };

export default async function AdminManualReviewPage() {
  const screening = await mockAdminQueueItems("screening-fail");
  const refunds = await mockAdminQueueItems("refund-review");
  const agents = await mockAdminQueueItems("agent-flagged");
  const all = [...screening, ...refunds, ...agents].sort(
    (a, b) => +b.openedAt - +a.openedAt,
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <Eyebrow>Admin · Manual review</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Manual review
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Items the automated risk engine couldn&apos;t resolve. Operator
              decides: release, hold longer, or escalate. Every action stamps a
              ReasonCode + audit log.
            </p>
          </div>
          <Badge tone={all.length > 0 ? "sim" : "live"}>
            {all.length} open
          </Badge>
        </header>

        {all.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8 text-sm text-[var(--color-ink-muted)]">
            Nothing in review. Daemon pushes here when 3-of-3 screening returns
            review, when a refund authorization needs operator countersign, or
            when an ACPHook flags an agent.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
            {all.map((it) => (
              <li
                key={`${it.kind}-${it.id}`}
                className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.6fr_auto_auto_auto_auto] md:items-center"
              >
                <Link href={it.href as never} className="hover:underline">
                  <div className="font-medium">{it.label}</div>
                  <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                    {shortAddress(it.id as `0x${string}`)}
                  </div>
                </Link>
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                  {it.kind.replace("-", " ")}
                </span>
                {it.amountUsdc !== undefined ? (
                  <span className="text-sm">{formatUSDC(it.amountUsdc)}</span>
                ) : (
                  <span />
                )}
                <Badge tone={SEVERITY_TONE[it.severity]}>{it.severity}</Badge>
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
