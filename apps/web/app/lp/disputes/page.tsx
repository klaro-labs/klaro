import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { listAll } from "@/lib/repo/disputes";
import { getCashout } from "@/lib/repo/cashouts";
import { getCurrentLpSession } from "@/lib/auth";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { lpDefendAction } from "./actions";

const STATUS_TONE = {
  OPENED: "info",
  EVIDENCE_REQUESTED: "sim",
  EVIDENCE_SUBMITTED: "info",
  UNDER_REVIEW: "sim",
  DECIDED: "live",
} as const;

const ENTRY_POINTS = [
  "Defend the proof I already submitted",
  "Add bank-side verification (UTR pull)",
  "Acknowledge issue + propose mutual resolution",
  "Request escalation to senior reviewer",
];

export default async function LPDisputesPage() {
  const session = await getCurrentLpSession();
  const entityName =
    session?.lp.legalEntityName ?? session?.lp.contactEmail ?? "Klaro LP";

  // `mockListDisputesAll()` returns every dispute
  // system-wide; the LP defense queue used to render all of them.
  // LP-A could see LP-B's openingNote/evidence/amounts. Same
  // ownership gate `lpDefendAction` already enforces:
  // case.context === "cashout" AND cashout.lpId === session.lp.lpId.
  const all = await listAll();
  const lpId = session?.lp.lpId;
  const cases = lpId
    ? (
        await Promise.all(
          all.map(async (c) => {
            if (c.context !== "cashout") return null;
            const cashout = await getCashout(c.contextRefId);
            return cashout && cashout.lpId === lpId ? c : null;
          }),
        )
      ).filter((c): c is NonNullable<typeof c> => c !== null)
    : [];

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Active disputes
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Defense queue
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Cases where you&apos;re the respondent. Four defense entry points;
              respond in 48 hours to keep stake intact. Reading{" "}
              <Link
                href="/lp/disputes-explainer"
                className="text-[var(--color-brand)] hover:underline"
              >
                the playbook
              </Link>{" "}
              first improves outcomes.
            </p>
          </div>
          <Badge tone="sim">
            {cases.filter((c) => c.status !== "DECIDED").length} active
          </Badge>
        </div>

        <div className="mb-6 rounded border border-[var(--color-line)] bg-white p-4 text-sm">
          <p className="font-medium">Four standard defenses</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--color-ink-muted)]">
            {ENTRY_POINTS.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>

        {cases.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No active disputes against you. Keep submitting proof on time.
          </p>
        ) : (
          <ul className="space-y-4">
            {cases.map((c) => (
              <li
                key={c.caseId}
                className="rounded-lg border border-[var(--color-line)] bg-white p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {c.claimantLabel} disputes {formatUSDC(c.amountUsdc)}
                    </div>
                    <div className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
                      case {shortAddress(c.caseId)} · ref{" "}
                      {shortAddress(c.contextRefId)} · {c.context}
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
                      {c.openingNote}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                      Last update {relativeTime(c.updatedAt)} ·{" "}
                      {c.evidence.length} evidence items
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>
                    {c.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                {c.status !== "DECIDED" && (
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      const note = String(formData.get("note") ?? "");
                      await lpDefendAction(c.caseId, note);
                    }}
                    className="mt-4 border-t border-[var(--color-line)] pt-4"
                  >
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-subtle)]">
                      Add defense
                    </p>
                    <textarea
                      name="note"
                      required
                      minLength={5}
                      rows={3}
                      placeholder="Bank-side UTR confirmation pulled from HDFC API — funds did land. See attached log."
                      className="w-full rounded border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
                    />
                    <button
                      type="submit"
                      className="mt-2 rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
                    >
                      Submit defense
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
