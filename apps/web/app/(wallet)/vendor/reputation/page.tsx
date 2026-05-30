import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import {
  mockComputeReputation,
  mockListReputationEvents,
} from "@/lib/mockData";
import {
  isLiveOnChain,
  isReputationLiveOnChain,
  readReputationScore,
} from "@/lib/arcClient";
import { relativeTime, shortAddress } from "@/lib/money";

const TIER_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  EMERGING: "neutral",
  ACTIVE: "info",
  ESTABLISHED: "live",
  PRIORITY: "live",
};

const FIELD_LABELS: Record<string, string> = {
  paymentConsistency: "Payment consistency",
  cashoutHistory: "Cashout history",
  disputeRate: "Dispute rate",
  agentJobs: "Agent job completion",
  kybStatus: "KYB status",
  tenure: "Tenure",
  velocity: "Activity velocity",
};

const KIND_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  INVOICE_SETTLED: "live",
  INVOICE_SETTLED_LATE: "info",
  CASHOUT_RELEASED: "live",
  AGENT_JOB_CLOSED: "live",
  KYB_PASSED: "live",
  DISPUTE_WON: "live",
  DISPUTE_OPENED: "info",
  DISPUTE_LOST: "sim",
  REFUND_ISSUED: "neutral",
  SLASH_PENALTY: "sim",
  KYB_REVOKED: "sim",
  MANUAL_ADJUST: "neutral",
};

export default async function ReputationPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const mockScore = await mockComputeReputation(
    session.vendor.id,
    session.vendor.createdAt,
  );
  const liveResult = isReputationLiveOnChain()
    ? await readReputationScore(session.vendor.id)
    : null;
  const score =
    liveResult && liveResult.source === "live-arc"
      ? {
          ...mockScore,
          score: liveResult.score,
          tier: liveResult.tier,
          raw: Number(liveResult.rawSum),
        }
      : mockScore;
  const events = await mockListReputationEvents(session.vendor.id);

  const MAX_SCORE = 1000;
  const scorePct = Math.min(100, Math.round((score.score / MAX_SCORE) * 100));

  const TIER_LETTER: Record<typeof score.tier, string> = {
    EMERGING: "D",
    ACTIVE: "C",
    ESTABLISHED: "B",
    PRIORITY: "A",
  };

  const thisMonthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const settledThisMonth = events.filter(
    (e) =>
      (e.kind === "INVOICE_SETTLED" || e.kind === "INVOICE_SETTLED_LATE") &&
      +e.at >= +thisMonthStart,
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Trust Score
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Your reputation
          </h1>
        </div>
        <Badge tone={TIER_TONE[score.tier]}>
          Tier {TIER_LETTER[score.tier]} · {score.tier}
        </Badge>
      </header>

      <div className="mt-6 rounded-lg border-2 border-[var(--color-ink)] bg-[var(--color-bg)] p-5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">
            {isLiveOnChain() ? "Append-only on-chain log." : "Reputation log."}
          </p>
          <Badge tone={isLiveOnChain() ? "live" : "sim"}>
            {isLiveOnChain()
              ? "Live · Arc"
              : "[SIMULATED] · contracts not deployed"}
          </Badge>
        </div>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          {isLiveOnChain() ? (
            <>
              Every event below is committed to{" "}
              <code className="font-mono text-xs">VendorReputation</code> on
              Arc. Scoring formula{" "}
              <code className="font-mono">v{score.formulaVersion}</code>{" "}
              derived by{" "}
              <code className="font-mono">ReputationManager</code>. Klaro
              cannot silently rewrite your history — formula changes bump the
              version so historical scores stay reproducible.
            </>
          ) : (
            <>
              Showing simulated reputation events. Once{" "}
              <code className="font-mono text-xs">VendorReputation</code> is
              deployed on Arc testnet, the same UI reads on-chain — formula{" "}
              <code className="font-mono">v{score.formulaVersion}</code> stays
              the same so scores remain reproducible across the cutover.
            </>
          )}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[auto_1fr]">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl font-semibold">
              {score.score}
            </span>
            <span className="text-lg text-[var(--color-ink-subtle)]">
              / {MAX_SCORE}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-line)] md:w-64">
            <div
              className="h-full rounded-full bg-[var(--color-brand)]"
              style={{ width: `${scorePct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Raw weight sum: <span className="font-mono">{score.raw}</span> ·{" "}
            {settledThisMonth} settled this month
          </p>
        </div>
        <div className="border-t border-[var(--color-line)] pt-3 md:border-t-0 md:border-l md:pl-6 md:pt-0">
          <p className="text-xs text-[var(--color-ink-subtle)]">Tier ladder</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              <span className="font-mono">0–399</span> · EMERGING
            </li>
            <li>
              <span className="font-mono">400–649</span> · ACTIVE
            </li>
            <li>
              <span className="font-mono">650–849</span> · ESTABLISHED
            </li>
            <li>
              <span className="font-mono">850–1000</span> · PRIORITY
            </li>
          </ul>
        </div>
      </div>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">7 fields</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Object.entries(score.fields).map(([k, v]) => (
          <div
            key={k}
            className="rounded-lg border border-[var(--color-line)] bg-white p-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{FIELD_LABELS[k] ?? k}</span>
              <span className="font-mono text-sm">{v} / 100</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
              <div
                className="h-full bg-[var(--color-brand)]"
                style={{ width: `${v}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
        Event log ({events.length})
      </h2>
      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold tracking-tight">
            No reputation events yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-ink-muted)]">
            Settled invoices, cashouts, agent jobs, and KYB updates all post
            here. Your score climbs as you ship.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {events.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-1 gap-1 px-5 py-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center md:gap-3"
            >
              <Badge tone={KIND_TONE[e.kind] ?? "neutral"}>
                {e.kind.replace(/_/g, " ")}
              </Badge>
              <div>
                <div className="text-sm">{e.note}</div>
                <div className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                  evidence {shortAddress(e.evidenceHash)}
                </div>
              </div>
              <span
                className={`font-mono text-sm ${e.weight > 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {e.weight > 0 ? "+" : ""}
                {e.weight}
              </span>
              <span className="text-xs text-[var(--color-ink-subtle)]">
                {relativeTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
