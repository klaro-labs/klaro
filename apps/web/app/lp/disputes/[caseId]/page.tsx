import { notFound } from "next/navigation";
import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { mockGetDispute } from "@/lib/mockData";
import { getCashout } from "@/lib/repo/cashouts";
import { getCurrentLpSession } from "@/lib/auth";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";

const STATUS_TONE = {
  OPENED: "info",
  EVIDENCE_REQUESTED: "sim",
  EVIDENCE_SUBMITTED: "info",
  UNDER_REVIEW: "sim",
  DECIDED: "live",
} as const;

export default async function LPDisputeDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const c = await mockGetDispute(caseId as Hex);
  if (!c) notFound();

  // Audit fix (loop ): derive LP from session, not array[0].
  const session = await getCurrentLpSession();
  const lp = session?.lp ?? null;
  const entityName = lp?.legalEntityName ?? lp?.contactEmail ?? "Klaro LP";

  // previous gate used `claimantLabel/respondentLabel
  // .toLowerCase().includes(entityName.toLowerCase())` — any LP whose
  // `legalEntityName` shared a substring with a party label
  // ("Pvt Ltd", "Klaro", any vendor display-name fragment) saw full
  // case detail across tenants. Switched to the same id-based check
  // that `lpDefendAction` already enforces.
  const lpAssignedCashout =
    lp && c.context === "cashout" ? await getCashout(c.contextRefId) : null;
  const youArePart = Boolean(
    lp && lpAssignedCashout && lpAssignedCashout.lpId === lp.lpId,
  );
  // The vendor-side claimant gate runs in app/vendor/disputes/[caseId];
  // this page is LP-defender-only so the YOU AS CLAIMANT label is
  // never shown for the LP-vs-vendor cashout flow.
  const youAreClaimant = false;
  if (!youArePart) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName={entityName} />
        <section className="mx-auto w-full max-w-[900px] px-6 py-10">
          <h1 className="font-display text-3xl font-semibold">Not your case</h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            This dispute isn&apos;t routed to your LP entity. If you think this
            is an error, contact{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:lp@klaro.so"
            >
              lp@klaro.so
            </a>
            .
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <Link
          href="/lp/disputes"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← Your disputes
        </Link>

        <header className="mt-3 mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Case {shortAddress(c.caseId)} · {c.context}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {youAreClaimant ? "You vs." : "vs. you · "}{" "}
              {youAreClaimant ? c.respondentLabel : c.claimantLabel}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Opened {relativeTime(c.openedAt)} · {formatUSDC(c.amountUsdc)} at
              stake
            </p>
          </div>
          <Badge tone={STATUS_TONE[c.status]}>
            {c.status.replace("_", " ")}
          </Badge>
        </header>

        <section className="mb-8 rounded-lg border border-[var(--color-line)] bg-white p-6">
          <h2 className="font-display text-base font-semibold">
            Plain-language summary
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {c.openingNote ||
              "The other side claims the cashout proof you submitted does not match the local-rail payment. Klaro is reviewing the evidence bundle."}
          </p>
        </section>

        <h2 className="mb-3 font-display text-lg font-semibold">Evidence</h2>
        <ul className="mb-8 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {c.evidence.length === 0 ? (
            <li className="px-6 py-4 text-sm text-[var(--color-ink-muted)]">
              No evidence submitted yet.
            </li>
          ) : (
            c.evidence.map((e, i) => (
              <li
                key={i}
                className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[auto_1fr_auto] md:items-center"
              >
                <Badge
                  tone={
                    e.by === "operator"
                      ? "live"
                      : e.by === "claimant"
                        ? "info"
                        : "neutral"
                  }
                >
                  {e.by}
                </Badge>
                <span className="text-sm">{e.note}</span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  {shortAddress(e.hash)}
                </span>
              </li>
            ))
          )}
        </ul>

        {c.status !== "DECIDED" ? (
          <section className="rounded-lg border border-[var(--color-line)] bg-white p-6">
            <h2 className="font-display text-base font-semibold">
              Submit evidence
            </h2>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Evidence upload is shown for the planned live workflow. Demo
              disputes are resolved from the seeded case data only.
            </p>
            <button
              disabled
              className="mt-4 cursor-not-allowed rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white opacity-45"
            >
              Evidence upload pending
            </button>
          </section>
        ) : (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="font-display text-base font-semibold text-emerald-900">
              Decision
            </h2>
            <p className="mt-2 text-sm text-emerald-900/80">
              {c.decisionNote ?? c.outcome ?? "DECIDED"}
            </p>
            {c.decisionReasonHash && (
              <p className="mt-2 font-mono text-xs text-emerald-900/60">
                ReasonCode: {shortAddress(c.decisionReasonHash)}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
