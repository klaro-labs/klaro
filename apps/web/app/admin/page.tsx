import Link from "next/link";
import type { Route } from "next";
import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import {
  mockAdminQueueCounts,
  mockAdminQueueItems,
  type AdminQueueKind,
} from "@/lib/mockData";
import { SEVERITY_TONE } from "@/lib/severityTone";
import { formatUSDC, shortAddress } from "@/lib/money";

const QUEUES: { kind: AdminQueueKind; label: string; description: string }[] = [
  {
    kind: "disputes",
    label: "Disputes",
    description: "Open dispute cases awaiting evidence or panel decision.",
  },
  {
    kind: "cashout-pending",
    label: "Cashout pending",
    description: "LOCKED cashouts waiting for LP claim or operator routing.",
  },
  {
    kind: "refund-review",
    label: "Refund review",
    description: "Refund authorizations needing operator countersign.",
  },
  {
    kind: "lp-kyb",
    label: "LP KYB",
    description: "Pending LP applications + KYB document re-checks.",
  },
  {
    kind: "agent-flagged",
    label: "Agents flagged",
    description:
      "Agents tripped by ACPHook screening — review + reactivate or revoke.",
  },
  {
    kind: "screening-fail",
    label: "Screening fail",
    description: "Payments where the 3-of-3 screening returned a hold.",
  },
  {
    kind: "sub-stake-lp",
    label: "Sub-stake LPs",
    description: "LPs whose stake fell below their tier threshold.",
  },
  {
    kind: "frozen",
    label: "Frozen orders",
    description: "Cashout orders frozen pending verifier review.",
  },
  {
    kind: "locked-out",
    label: "Locked-out vendors",
    description: "Vendors temporarily locked-out from cashouts pending re-KYC.",
  },
  {
    kind: "dispute-overdue",
    label: "Dispute SLA overdue",
    description: "Disputes past the 24h SLA window.",
  },
  {
    kind: "pause-active",
    label: "Active pauses",
    description: "Currently-paused contracts (corridor or full).",
  },
];

export default async function AdminQueuesPage() {
  const counts = await mockAdminQueueCounts();
  // Eager-load items for the top 4 queues to render inline; tail queues stay as cards.
  const inlineKinds: AdminQueueKind[] = [
    "disputes",
    "cashout-pending",
    "lp-kyb",
    "refund-review",
  ];
  const inlineItems = await Promise.all(
    inlineKinds.map((k) => mockAdminQueueItems(k)),
  );

  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Operator console</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {QUEUES.length} queues
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Every Klaro decision that needs a human lands in one of these
              queues. Items page + auto-tag with severity + age. 9 admin actions
              (admit / suspend / slash / refund / pause / resume / revoke /
              decide / annotate) all stamp ReasonCodes + an audit log.
            </p>
          </div>
          <Badge tone={totalOpen > 0 ? "sim" : "live"}>{totalOpen} open</Badge>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {QUEUES.map((q) => (
            <Link
              key={q.kind}
              href={`#${q.kind}`}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{q.label}</span>
                <span className="font-display text-xl font-semibold">
                  {counts[q.kind] ?? 0}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-ink-subtle)] line-clamp-3">
                {q.description}
              </p>
            </Link>
          ))}
        </div>

        {QUEUES.filter((q) => inlineKinds.includes(q.kind)).map((q, qi) => {
          const items = inlineItems[qi] ?? [];
          return (
            <section key={q.kind} id={q.kind} className="mb-10">
              <h2 className="mb-3 font-display text-xl font-semibold">
                {q.label}
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Queue empty. Daemon writes here in live mode.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[1.6fr_auto_auto_auto] md:items-center"
                    >
                      <Link href={it.href as Route} className="hover:underline">
                        <div className="font-medium">{it.label}</div>
                        <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                          {shortAddress(it.id as `0x${string}`)}
                        </div>
                      </Link>
                      {it.amountUsdc !== undefined && (
                        <span className="text-sm">
                          {formatUSDC(it.amountUsdc)}
                        </span>
                      )}
                      <Badge tone={SEVERITY_TONE[it.severity]}>
                        {it.severity}
                      </Badge>
                      <span className="text-xs text-[var(--color-ink-subtle)]">
                        {it.ageHours}h
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    </main>
  );
}
