import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getDispute } from "@/lib/repo/disputes";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { getCurrentSession } from "@/lib/auth";
import { AddEvidenceForm } from "./AddEvidenceForm";
import type { Hex } from "@/lib/types";

const STATUS_TONE = {
  OPENED: "info",
  EVIDENCE_REQUESTED: "sim",
  EVIDENCE_SUBMITTED: "info",
  UNDER_REVIEW: "sim",
  DECIDED: "live",
} as const;

const EVIDENCE_TONE: Record<
  "claimant" | "respondent" | "operator",
  "info" | "neutral" | "live"
> = {
  claimant: "info",
  respondent: "neutral",
  operator: "live",
};

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const session = await getCurrentSession();
  const c = await getDispute(caseId as Hex);
  // page used to read any
  // dispute by id without a vendor-ownership check. Any signed-in
  // vendor could paste another tenant's case URL and read the
  // respondent, dollar amount, opening note, and full evidence
  // timeline — Klaro violation. Mutation
  // (`addEvidenceAction`) already gated; this is the read-side gap.
  // Return notFound rather than a 403 so the route doesn't leak
  // case existence.
  if (!c || !session || c.vendorId !== session.vendor.id) notFound();

  return (
    <div>
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <Link
          href="/vendor/disputes"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← Back to all disputes
        </Link>

        <div className="mt-3 mb-6 flex items-start justify-between gap-4">
          <div>
            <Eyebrow>
              Case {shortAddress(c.caseId)} · {c.context}
            </Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              vs. {c.respondentLabel}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Opened {relativeTime(c.openedAt)} · last update{" "}
              {relativeTime(c.updatedAt)} · {formatUSDC(c.amountUsdc)} in
              dispute
            </p>
          </div>
          <Badge tone={STATUS_TONE[c.status]}>
            {c.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="mb-6 rounded-lg border border-[var(--color-line)] bg-white p-5">
          <h2 className="font-medium">Opening statement</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-ink-muted)]">
            {c.openingNote}
          </p>
          <p className="mt-3 font-mono text-xs text-[var(--color-ink-subtle)]">
            Reference: {shortAddress(c.contextRefId)}
          </p>
        </div>

        {c.status === "EVIDENCE_REQUESTED" &&
          (() => {
            // surface the operator's most recent evidence request
            // prominently so the vendor knows exactly what to upload. The
            // generic "Add evidence" form below isn't enough —
            // says every state needs a clear next step. The operator-side
            // action writes a row with `by: "operator"` whose `note` starts
            // with "Operator requested:" (see admin/disputes/actions.ts).
            const lastOperatorAsk = [...c.evidence]
              .reverse()
              .find((e) => e.by === "operator");
            return (
              <aside
                className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-5"
                aria-labelledby="evidence-requested-callout"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-white"
                  >
                    !
                  </span>
                  <div>
                    <h2
                      id="evidence-requested-callout"
                      className="font-medium text-amber-900"
                    >
                      Klaro requested more evidence
                    </h2>
                    {lastOperatorAsk ? (
                      <p className="mt-1 text-sm text-amber-900/90">
                        {lastOperatorAsk.note}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-900/90">
                        Klaro asked for additional evidence. Use the form below
                        to upload it.
                      </p>
                    )}
                    <a
                      href="#add-evidence"
                      className="mt-3 inline-flex h-9 items-center rounded-pill border border-amber-400 bg-white px-4 text-xs font-medium text-amber-900 hover:bg-amber-100"
                    >
                      Add evidence →
                    </a>
                  </div>
                </div>
              </aside>
            );
          })()}

        <h2 className="mb-3 font-display text-xl font-semibold">
          Evidence timeline
        </h2>
        <ol className="mb-8 space-y-3">
          {c.evidence.map((e, i) => (
            <li
              key={i}
              className="rounded-lg border border-[var(--color-line)] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone={EVIDENCE_TONE[e.by]}>{e.by}</Badge>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(e.at)}
                </span>
              </div>
              <p className="mt-2 text-sm">{e.note}</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-subtle)]">
                hash {shortAddress(e.hash)}
              </p>
            </li>
          ))}
        </ol>

        {c.status === "DECIDED" ? (
          <div className="rounded-lg border border-[var(--color-brand)] bg-white p-5">
            <h2 className="font-display text-lg font-semibold">
              Decision: {c.outcome?.replace(/_/g, " ")}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {c.decisionNote ?? "Simulated decision recorded."}
            </p>
            {c.decisionReasonHash && (
              <p className="mt-2 font-mono text-xs text-[var(--color-ink-subtle)]">
                Reason hash {shortAddress(c.decisionReasonHash)}
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
              Decided {relativeTime(c.decidedAt ?? c.updatedAt)}
            </p>
          </div>
        ) : (
          <AddEvidenceForm caseId={c.caseId} />
        )}
      </section>
    </div>
  );
}
