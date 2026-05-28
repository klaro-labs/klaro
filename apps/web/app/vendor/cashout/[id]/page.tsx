import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { CashoutActions } from "@/components/klaro/CashoutActions";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo.
import { getCashout } from "@/lib/repo/cashouts";
import { formatUSDC, shortAddress, relativeTime } from "@/lib/money";
import { getCorridor, formatPayout } from "@/lib/corridors";
import type { Hex, CashoutStatus, CashoutTimelineEvent } from "@/lib/types";

/**
 * /vendor/cashout/[id] — full timeline + proof preview + vendor actions.
 * Maps to v2 §20 "cashout order detail" surface.
 */

const STATUS_TONE: Record<CashoutStatus, "live" | "info" | "neutral" | "sim"> =
  {
    REQUESTED: "neutral",
    LOCKED: "info",
    CLAIMED: "info",
    PROOF_SUBMITTED: "info",
    CONFIRMED: "live",
    RELEASED: "live",
    DISPUTED: "sim",
    RESOLVED_LP_PAYS: "live",
    RESOLVED_VENDOR_PAYS: "neutral",
    EXPIRED: "neutral",
    CANCELLED: "neutral",
  };

const LIVE_STAGE_ORDER: {
  kind: CashoutTimelineEvent["kind"];
  label: string;
}[] = [
  { kind: "locked", label: "USDC locked in escrow" },
  { kind: "lp_assigned", label: "LP assigned" },
  { kind: "proof_submitted", label: "INR payout proof submitted" },
  { kind: "confirmed", label: "Vendor confirmed receipt" },
  { kind: "released", label: "USDC released to LP" },
];

const SIM_STAGE_ORDER: { kind: CashoutTimelineEvent["kind"]; label: string }[] =
  [
    { kind: "locked", label: "Demo order created" },
    { kind: "lp_assigned", label: "Simulated LP assigned" },
    { kind: "proof_submitted", label: "Demo payout proof submitted" },
    { kind: "confirmed", label: "Vendor confirmed simulated outcome" },
    { kind: "released", label: "Simulation completed" },
  ];

export default async function CashoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) notFound();
  const { id } = await params;
  const order = await getCashout(id as Hex);
  if (!order || order.vendorId !== session.vendor.id) notFound();
  const corridor = getCorridor(order.currency);
  const simulated = session.simulated;

  return (
    <div>
      <section className="mx-auto w-full max-w-3xl px-6 py-12 md:py-12">
        <Link
          href="/vendor/cashout"
          className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          ← All cashouts
        </Link>

        <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
              {shortAddress(order.id)}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {formatUSDC(order.usdcAmount)} →{" "}
              {corridor
                ? formatPayout(order.payoutMinor, corridor)
                : order.currency}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Requested {relativeTime(order.requestedAt)} · {corridor?.country}{" "}
              · {corridor?.route}
            </p>
          </div>
          <Badge tone={STATUS_TONE[order.status]}>
            {order.status.replace(/_/g, " ")}
          </Badge>
        </header>

        <Section title="Order timeline">
          <Timeline
            events={order.timeline}
            status={order.status}
            simulated={simulated}
          />
        </Section>

        <Section title="Quote">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-ink-subtle)]">
              {simulated ? "Demo USDC amount" : "USDC locked"}
            </dt>
            <dd>{formatUSDC(order.usdcAmount)}</dd>
            <dt className="text-[var(--color-ink-subtle)]">Klaro fee</dt>
            <dd>{formatUSDC(order.klaroFeeUsdc)}</dd>
            <dt className="text-[var(--color-ink-subtle)]">LP spread</dt>
            <dd>{formatUSDC(order.lpSpreadUsdc)}</dd>
            <dt className="text-[var(--color-ink-subtle)]">Rate</dt>
            <dd>
              1 USDC = {order.quoteRate} {order.currency}
            </dd>
            <dt className="text-[var(--color-ink-subtle)]">Receive</dt>
            <dd>
              {corridor ? formatPayout(order.payoutMinor, corridor) : "—"}
            </dd>
          </dl>
        </Section>

        {order.lpId ? (
          <Section title="LP">
            <p className="font-medium">{order.lpName}</p>
            <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
              {order.lpId}
            </p>
          </Section>
        ) : null}

        {order.proofHash ? (
          <Section title="Proof anchor">
            <p className="font-mono text-xs break-all text-[var(--color-ink-muted)]">
              {order.proofHash}
            </p>
            {order.utrReference ? (
              <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                UTR reference:{" "}
                <span className="font-mono">{order.utrReference}</span>
                {simulated
                  ? " (demo reference; not submitted onchain)"
                  : " (hashed onchain; raw value kept off-chain per Klaro PII rule)"}
              </p>
            ) : null}
          </Section>
        ) : null}

        {order.status === "PROOF_SUBMITTED" ? (
          <ConfirmDeadlineBanner
            timeline={order.timeline}
            simulated={simulated}
          />
        ) : null}

        {order.status === "PROOF_SUBMITTED" || order.status === "CLAIMED" ? (
          <Section title="Actions">
            <CashoutActions id={order.id} simulated={simulated} />
          </Section>
        ) : null}

        <p className="mt-8 text-center text-[11px] text-[var(--color-ink-subtle)]">
          {simulated
            ? "Simulator only · no USDC or local currency moves · no proof is submitted onchain."
            : "Klaro is not a bank · USDC stays in escrow on Arc until you confirm local currency landed · Mainnet payout availability depends on the licensed partner per corridor."}
        </p>
      </section>
    </div>
  );
}

/** Audit fix (loop iter 15, 2026-05-25): PROOF_SUBMITTED orders had no
 * visible deadline. CashoutOrderProcessor.CONFIRM_WINDOW is 24h on chain —
 * if vendor doesn't confirm or dispute, operator calls expireUnconfirmed()
 * and refunds the vendor's USDC. Render the deadline so they don't sleep
 * through it. */
function ConfirmDeadlineBanner({
  timeline,
  simulated,
}: {
  timeline: CashoutTimelineEvent[];
  simulated: boolean;
}) {
  const proof = [...timeline]
    .reverse()
    .find((e) => e.kind === "proof_submitted");
  if (!proof) return null;
  const deadline = new Date(+proof.at + 24 * 3600 * 1000);
  const hoursLeft = Math.max(
    0,
    Math.floor((+deadline - Date.now()) / 3_600_000),
  );
  const minutesLeft = Math.max(
    0,
    Math.floor(((+deadline - Date.now()) % 3_600_000) / 60_000),
  );
  const past = +deadline < Date.now();
  return (
    <div
      className={`mt-6 rounded-lg border p-4 ${past ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
    >
      <p
        className={`text-sm font-medium ${past ? "text-rose-900" : "text-amber-900"}`}
      >
        {past
          ? "Confirm window expired"
          : simulated
            ? `${hoursLeft}h ${minutesLeft}m left to complete or dispute this simulation`
            : `${hoursLeft}h ${minutesLeft}m left to confirm or dispute`}
      </p>
      <p
        className={`mt-1 text-xs ${past ? "text-rose-900/80" : "text-amber-900/80"}`}
      >
        {past
          ? simulated
            ? "This simulated review window expired; create another demo cashout to continue testing."
            : "The operator can now run expireUnconfirmed() and refund your USDC. Contact support if the LP's INR landed and you want to release anyway."
          : simulated
            ? `Complete the simulated outcome or open a demo dispute for review. No funds move. Deadline: ${deadline.toLocaleString()}.`
            : `Confirm if the local-currency payout actually landed (USDC releases to LP) or open a dispute if it didn't (USDC stays in escrow). Deadline: ${deadline.toLocaleString()}.`}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {title}
      </h2>
      <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5">
        {children}
      </div>
    </div>
  );
}

function Timeline({
  events,
  status,
  simulated,
}: {
  events: CashoutTimelineEvent[];
  status: CashoutStatus;
  simulated: boolean;
}) {
  const done = new Set(events.map((e) => e.kind));
  const stages = simulated ? SIM_STAGE_ORDER : LIVE_STAGE_ORDER;
  return (
    <ol className="space-y-3">
      {stages.map((stage) => {
        const isDone = done.has(stage.kind);
        const event = events.find((e) => e.kind === stage.kind);
        return (
          <li key={stage.kind} className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                isDone
                  ? "mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500"
                  : "mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-line)]"
              }
            />
            <div className="flex-1">
              <p
                className={
                  isDone
                    ? "text-sm font-medium"
                    : "text-sm text-[var(--color-ink-subtle)]"
                }
              >
                {stage.label}
              </p>
              {event ? (
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {event.detail} · {relativeTime(event.at)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
      {status === "DISPUTED" ? (
        <li className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500"
          />
          <p className="text-sm font-medium text-rose-700">
            Dispute open — admin review in progress
          </p>
        </li>
      ) : null}
    </ol>
  );
}
