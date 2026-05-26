import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockListDisputesForVendor, type DisputeStatus } from "@/lib/mockData";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { openDisputeAction } from "./actions";

const STATUS_TONE: Record<DisputeStatus, "live" | "info" | "neutral" | "sim"> =
  {
    OPENED: "info",
    EVIDENCE_REQUESTED: "sim",
    EVIDENCE_SUBMITTED: "info",
    UNDER_REVIEW: "sim",
    DECIDED: "live",
  };
const STATUS_LABEL: Record<DisputeStatus, string> = {
  OPENED: "Opened",
  EVIDENCE_REQUESTED: "Klaro asked for more",
  EVIDENCE_SUBMITTED: "Awaiting review",
  UNDER_REVIEW: "Panel reviewing",
  DECIDED: "Decided",
};

const ENTRY_POINTS = [
  { label: "Cashout — INR didn't arrive", context: "cashout" as const },
  { label: "Cashout — wrong amount received", context: "cashout" as const },
  {
    label: "Invoice — buyer claims service failed",
    context: "invoice" as const,
  },
  { label: "Stream — work blocked, escalate", context: "stream" as const },
  { label: "Agent — wrong output, refund", context: "agent" as const },
];

export default async function DisputesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const cases = await mockListDisputesForVendor(session.vendor.id);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Disputes
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Disputes
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Open a simulated case file. Review the evidence workflow without
              moving funds or writing an onchain decision. Five entry points are
              available below.
            </p>
          </div>
          <Badge tone="info">
            {cases.length} {cases.length === 1 ? "case" : "cases"}
          </Badge>
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Open new case
        </h2>
        <form
          action={openDisputeAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Entry point</span>
            <select
              name="context"
              defaultValue="cashout"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              {ENTRY_POINTS.map((e) => (
                <option key={e.label} value={e.context}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Reference ID (cashoutId / invoiceId)
            </span>
            <input
              name="contextRefId"
              required
              placeholder="0x…"
              pattern="^0x[0-9a-fA-F]{64}$"
              className="rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Respondent (other party)
            </span>
            <input
              name="respondentLabel"
              required
              placeholder="Mudrex Pvt Ltd"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Amount in dispute (USDC)
            </span>
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue="50"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
            <span className="text-[var(--color-ink-muted)]">
              What happened? (≥ 20 chars)
            </span>
            <textarea
              name="note"
              required
              minLength={20}
              rows={4}
              placeholder="LP submitted screenshot but no INR landed in my account after 4 hours…"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Open dispute
            </button>
          </div>
        </form>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Your cases
        </h2>
        {cases.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No disputes yet — fingers crossed.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {cases.map((c) => (
              <li key={c.caseId} className="px-6 py-4">
                <Link
                  href={`/vendor/disputes/${c.caseId}`}
                  className="grid grid-cols-1 gap-1 md:grid-cols-[1.4fr_auto_auto_auto] md:items-center"
                >
                  <div>
                    <div className="font-medium">
                      {c.respondentLabel} · {c.context}
                    </div>
                    <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                      case {shortAddress(c.caseId)} · ref{" "}
                      {shortAddress(c.contextRefId)}
                    </div>
                  </div>
                  <div className="text-sm">{formatUSDC(c.amountUsdc)}</div>
                  <Badge tone={STATUS_TONE[c.status]}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    {relativeTime(c.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
