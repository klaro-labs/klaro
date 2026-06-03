import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Input } from "@/components/ui/Input";
import { type DisputeOutcome } from "@/lib/mockData";
import { listAll } from "@/lib/repo/disputes";
import { DISPUTE_STATUS_TONE, disputeStatusLabel } from "@/lib/disputeStatus";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import {
  decideDisputeAction,
  requestEvidenceAction,
  assignToReviewAction,
} from "./actions";

const OUTCOMES: { value: DisputeOutcome; label: string; desc: string }[] = [
  {
    value: "RELEASE_TO_CLAIMANT",
    label: "Release to claimant",
    desc: "Demo outcome: claimant prevails.",
  },
  {
    value: "REFUND_TO_RESPONDENT",
    label: "Refund respondent",
    desc: "Demo outcome: respondent prevails.",
  },
  {
    value: "SLASH_LP",
    label: "Slash LP + refund",
    desc: "Demo outcome: LP fault recorded.",
  },
  {
    value: "PENALIZE_VENDOR",
    label: "Penalize vendor",
    desc: "Demo outcome: vendor fault recorded.",
  },
  {
    value: "MUTUAL_RESOLVED",
    label: "Mutual resolved",
    desc: "Demo outcome: mutual resolution recorded.",
  },
];

export default async function AdminDisputesPage() {
  const cases = await listAll();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Operator queue</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Disputes
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Simulated operator queue. Decisions update demo workflow state
              only; no onchain decision is recorded and no funds move.
            </p>
          </div>
          <Badge tone="sim">
            {cases.filter((c) => c.status !== "DECIDED").length} open
          </Badge>
        </div>

        {cases.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No disputes in queue.
          </p>
        ) : (
          <ul className="space-y-4">
            {cases.map((c) => (
              <li
                key={c.caseId}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {c.claimantLabel}{" "}
                      <span className="text-[var(--color-ink-subtle)]">
                        vs.
                      </span>{" "}
                      {c.respondentLabel}
                    </div>
                    <div className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
                      case {shortAddress(c.caseId)} · ref{" "}
                      {shortAddress(c.contextRefId)} ·{" "}
                      {formatUSDC(c.amountUsdc)} · {c.context}
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
                      {c.openingNote}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                      {c.evidence.length} evidence items · last update{" "}
                      {relativeTime(c.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={DISPUTE_STATUS_TONE[c.status]}>
                    {disputeStatusLabel(c.status)}
                  </Badge>
                </div>

                {c.status !== "DECIDED" && (
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--color-line)] pt-4 md:grid-cols-[1fr_auto_auto]">
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        const askFor = String(formData.get("askFor") ?? "");
                        if (askFor)
                          await requestEvidenceAction(c.caseId, askFor);
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        name="askFor"
                        aria-label="Evidence to request from the parties"
                        placeholder="Ask for: bank statement, additional screenshot…"
                        className="h-9 flex-1"
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Request evidence
                      </Button>
                    </form>
                    {c.status !== "UNDER_REVIEW" && (
                      <form
                        action={async () => {
                          "use server";
                          await assignToReviewAction(c.caseId);
                        }}
                      >
                        <Button type="submit" variant="secondary" size="sm">
                          Assign to panel
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {c.status === "UNDER_REVIEW" && (
                  <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
                      Decide
                    </p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                      {OUTCOMES.filter(
                        (o) =>
                          c.context !== "cashout" ||
                          o.value === "RELEASE_TO_CLAIMANT" ||
                          o.value === "REFUND_TO_RESPONDENT" ||
                          o.value === "SLASH_LP",
                      ).map((o) => (
                        <form
                          key={o.value}
                          action={async (formData: FormData) => {
                            "use server";
                            const note = String(
                              formData.get("note") ?? "Panel decision",
                            );
                            await decideDisputeAction(c.caseId, o.value, note);
                          }}
                        >
                          <input
                            type="hidden"
                            name="note"
                            value={`${o.label}: panel reasoning recorded off-chain.`}
                          />
                          <button
                            title={o.desc}
                            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-3 text-left text-xs font-medium transition-colors hover:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
                          >
                            <div className="font-semibold">{o.label}</div>
                            <div className="mt-1 text-[10px] text-[var(--color-ink-subtle)]">
                              {o.desc}
                            </div>
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                )}

                {c.status === "DECIDED" && (
                  <div className="mt-4 border-t border-[var(--color-line)] pt-4 text-sm">
                    <div className="font-medium">
                      Outcome: {c.outcome?.replace(/_/g, " ")}
                    </div>
                    <p className="mt-1 text-[var(--color-ink-muted)]">
                      {c.decisionNote}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
