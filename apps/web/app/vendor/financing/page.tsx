import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo; mockComputeBalances kept (pure).
import { mockComputeBalances } from "@/lib/mockData";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor as listCashoutsForVendor } from "@/lib/repo/cashouts";
import {
  computeReadiness,
  VERBATIM_DISCLAIMER,
} from "@/lib/financingReadiness";

const TIER_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  EMERGING: "neutral",
  ACTIVE: "info",
  ESTABLISHED: "live",
  PRIORITY: "live",
};

export default async function FinancingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const invoices = await listInvoicesForVendor(session.vendor.id);
  const cashouts = await listCashoutsForVendor(session.vendor.id);
  const balances = mockComputeBalances(invoices, cashouts);
  const score = computeReadiness({
    vendorCreatedAt: session.vendor.createdAt,
    invoices,
    cashouts,
    balances,
  });

  return (
    <div>
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Financing readiness
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Readiness preview
            </h1>
          </div>
          <Badge tone={TIER_TONE[score.tier]}>{score.tier}</Badge>
        </div>

        {/* MANDATORY VERBATIM DISCLAIMER (v2 §27) */}
        <div className="mb-6 rounded-lg border-2 border-[var(--color-ink)] bg-[var(--color-bg)] p-5">
          <p className="text-sm font-medium">{VERBATIM_DISCLAIMER}</p>
        </div>

        <div className="mb-6 rounded-lg border border-[var(--color-line)] bg-white p-6">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl font-semibold">
              {score.score}
            </span>
            <span className="text-lg text-[var(--color-ink-subtle)]">
              / 1000
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Composite of 7 sub-scores below. Tier <strong>{score.tier}</strong>.
          </p>
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Sub-scores</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(score.sub).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-[var(--color-line)] bg-white p-4"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium capitalize">
                  {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                </span>
                <span className="font-mono text-sm">{value} / 100</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                <div
                  className="h-full bg-[var(--color-brand)]"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {score.strengths.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 font-display text-xl font-semibold">
              Strengths
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
              {score.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        )}
        {score.improvements.length > 0 && (
          <>
            <h2 className="mt-6 mb-3 font-display text-xl font-semibold">
              Improve before approaching financing
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
              {score.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-10 rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm">
          <p className="font-medium">
            Want to share this with a financing partner?
          </p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Klaro doesn&apos;t introduce partners. You control disclosure:
            download as PDF + send to whichever lender you&apos;re considering.
            Vendor-controlled, never auto-shared.
          </p>
          {/* Audit fix 2026-05-25 P0-7: button used to fire onClick with no
              handler, looking broken. Disable until the PDF export route lands
              in M12 — clearer than pretending the action exists. */}
          <button
            type="button"
            disabled
            title="Available soon when the PDF export route is live"
            className="mt-3 cursor-not-allowed rounded border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink-subtle)] opacity-60"
          >
            Download PDF preview · coming soon
          </button>
        </div>
      </section>
    </div>
  );
}
