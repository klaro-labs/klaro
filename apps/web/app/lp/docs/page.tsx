import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentLpSession } from "@/lib/auth";
import { shortAddress } from "@/lib/money";
import { submitDocsAction, approveApplicationAction } from "../actions";

const DOC_TYPES = [
  {
    key: "incorporation",
    label: "Certificate of incorporation",
    required: true,
  },
  {
    key: "kyc-principal",
    label: "Principal officer KYC (passport / national ID)",
    required: true,
  },
  {
    key: "kyb-questionnaire",
    label: "KYB questionnaire (signed)",
    required: true,
  },
  {
    key: "bank-letter",
    label: "Bank/UPI account confirmation letter",
    required: true,
  },
  {
    key: "compliance-policy",
    label: "AML/CFT policy (≥ T2 LPs only)",
    required: false,
  },
];

export default async function LPDocsPage() {
  // Audit fix (loop ): derive LP from session, not array[0].
  const session = await getCurrentLpSession();
  if (!session) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName="Klaro LP" />
        <section className="mx-auto w-full max-w-[700px] px-6 py-16 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Not an admitted LP.
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Document upload is gated to invited LPs. Email{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:lp@klaro.so"
            >
              lp@klaro.so
            </a>{" "}
            to apply.
          </p>
          <Link
            href="/lp"
            className="mt-6 inline-flex rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium hover:border-[var(--color-ink)]/40"
          >
            Back to LP overview
          </Link>
        </section>
      </main>
    );
  }
  const { lp, role } = session;
  const entityName = lp.legalEntityName ?? lp.contactEmail;
  const stage = lp.status;
  const docsSubmitted =
    stage === "UNDER_REVIEW" || stage === "APPROVED" || stage === "STAKED";
  // the [Operator] Approve button
  // was rendered unconditionally for any signed-in LP — the action's
  // `requireOperator()` would reject but the LP saw a primary-colored
  // button they thought they should click and got a server error.
  // Only render to operators.
  const isOperator = role === "operator";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[800px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Step 2 of 6 · Documents
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Upload KYB docs
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              PDFs encrypted in Supabase storage. Klaro derives a single bundle
              hash and anchors only that hash on Arc — your originals never
              leave private storage.
            </p>
          </div>
          <Badge tone={docsSubmitted ? "live" : "info"}>
            {docsSubmitted ? "Submitted" : "Pending"}
          </Badge>
        </div>

        <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
          <ul className="space-y-3 text-sm">
            {DOC_TYPES.map((d) => (
              <li
                key={d.key}
                className="flex items-center justify-between border-b border-[var(--color-line)] pb-3 last:border-0"
              >
                <div>
                  <div className="font-medium">{d.label}</div>
                  <div className="text-xs text-[var(--color-ink-subtle)]">
                    {d.required ? "Required" : "Optional"} ·{" "}
                    {docsSubmitted ? "Uploaded ✓" : "PDF · max 10MB"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Document upload is simulated in testnet mode"
                  className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium opacity-50 cursor-not-allowed"
                >
                  {docsSubmitted ? "Uploaded" : "Upload"}{" "}
                  <span className="font-mono text-[10px] text-[var(--color-ink-subtle)]">
                    SIM
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {lp.kybDocsHash && (
            <div className="mt-5 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs">
              <div className="font-medium">
                On-chain commitments (already anchored)
              </div>
              <div className="mt-1 text-[var(--color-ink-subtle)]">
                KYB bundle hash:{" "}
                <code className="font-mono">
                  {shortAddress(lp.kybDocsHash)}
                </code>
              </div>
              {lp.payoutAccountHash && (
                <div className="text-[var(--color-ink-subtle)]">
                  Payout account hash:{" "}
                  <code className="font-mono">
                    {shortAddress(lp.payoutAccountHash)}
                  </code>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!docsSubmitted ? (
              <form action={submitDocsAction}>
                <button className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black">
                  Submit for Klaro review →
                </button>
              </form>
            ) : isOperator ? (
              <form action={approveApplicationAction}>
                <input type="hidden" name="lpId" value={lp.lpId} />
                <button className="rounded bg-[var(--color-klaro-orange-deep)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                  [Operator] Approve application
                </button>
              </form>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Awaiting Klaro review — typical SLA 2 business days.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
