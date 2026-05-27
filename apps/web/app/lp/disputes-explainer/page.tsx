import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentLpSession } from "@/lib/auth";

const OUTCOMES = [
  {
    name: "RESOLVED_LP_PAYS",
    badge: "sim" as const,
    summary:
      "Demo outcome representing a vendor claim rejected after review. It records state only; no USDC releases.",
  },
  {
    name: "RESOLVED_VENDOR_PAYS",
    badge: "neutral" as const,
    summary:
      "Demo outcome representing a vendor-favouring decision. It records state only; no refund or slash occurs.",
  },
  {
    name: "EvidenceRequested",
    badge: "info" as const,
    summary:
      "Demo case paused while additional evidence would be requested in a live process.",
  },
  {
    name: "MUTUAL_RESOLVED",
    badge: "info" as const,
    summary:
      "Demo mutual outcome. A live fund route would require canonical contract enforcement.",
  },
];

const DEFENSE_TIPS = [
  "Always submit screenshot + UTR within 10 minutes of paying — late submissions look suspicious even when valid.",
  "Use the same payout account hash Klaro has on file. Sending from a different account is the #1 dispute trigger.",
  "Keep one week of bank statements ready to share if asked — speeds resolution.",
  "Never DM the vendor outside Klaro — the case file is the only thing the dispute panel reads.",
];

export default async function LPDisputesExplainerPage() {
  const session = await getCurrentLpSession();
  const entityName =
    session?.lp.legalEntityName ?? session?.lp.contactEmail ?? "Klaro LP";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[800px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Step 6 of 6 · Disputes
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Defending a dispute
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              This simulator demonstrates the dispute outcomes and evidence
              workflow. It does not move, refund or slash funds.
            </p>
          </div>
          <Badge tone="info">Dispute resolution</Badge>
        </div>

        <h2 className="mt-2 mb-3 font-display text-xl font-semibold">
          Four resolution paths
        </h2>
        <ul className="space-y-3">
          {OUTCOMES.map((o) => (
            <li
              key={o.name}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{o.name}</span>
                <Badge tone={o.badge}>
                  {o.name.startsWith("RESOLVED") ? "Final" : "Intermediate"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {o.summary}
              </p>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 mb-3 font-display text-xl font-semibold">
          Defense playbook
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
          {DEFENSE_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <h2 className="mt-8 mb-3 font-display text-xl font-semibold">
          Slash schedule (testnet preview)
        </h2>
        <table className="w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-white text-sm">
          <thead className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-subtle)]">
            <tr>
              <th className="px-4 py-2 text-left">Offense</th>
              <th className="px-4 py-2 text-left">Slash</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--color-line)]">
              <td className="px-4 py-2">First proven bad-proof</td>
              <td className="px-4 py-2">5% of stake</td>
            </tr>
            <tr className="border-b border-[var(--color-line)]">
              <td className="px-4 py-2">Second within 90 days</td>
              <td className="px-4 py-2">15% + 7-day suspension</td>
            </tr>
            <tr className="border-b border-[var(--color-line)]">
              <td className="px-4 py-2">Timeout without explanation</td>
              <td className="px-4 py-2">10% + tier downgrade</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Fraud (KYB confirmed)</td>
              <td className="px-4 py-2">100% + revoke</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6 text-xs text-[var(--color-ink-subtle)]">
          Planned live behavior: every slash anchors a{" "}
          <code className="font-mono">ReasonCodes.SLASH_LP_*</code> hash
          on-chain so the decision can be reviewed. The current simulator
          records demo outcomes only.
        </p>

        <Link
          href="/lp/queue"
          className="mt-8 inline-block rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          ← Back to queue
        </Link>
      </section>
    </main>
  );
}
