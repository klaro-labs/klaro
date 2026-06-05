import Link from "next/link";
import { redirect } from "next/navigation";
import { CashoutRequestForm } from "@/components/klaro/CashoutRequestForm";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo; mockComputeBalances
// kept (pure reducer, no IO).
import { mockComputeBalances } from "@/lib/mockData";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor as listCashoutsForVendor } from "@/lib/repo/cashouts";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { CORRIDORS, getCorridor, formatPayout } from "@/lib/corridors";
import type { CashoutStatus, CashoutOrder, Hex } from "@/lib/types";
import { confirmReceivedAction, openDisputeAction } from "./actions";

/**
 * /vendor/cashout — request panel + history list.
 * Maps to v2 §19 surface "myklaro.app/cashout".
 */

const STATUS_TONE: Record<
  CashoutStatus,
  "live" | "info" | "neutral" | "sim" | "verified"
> = {
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
const STATUS_LABEL: Record<CashoutStatus, string> = {
  REQUESTED: "Requested",
  LOCKED: "Locked",
  CLAIMED: "LP assigned",
  PROOF_SUBMITTED: "Proof in",
  CONFIRMED: "Confirmed",
  RELEASED: "Released",
  DISPUTED: "Disputed",
  // clarified vendor-perspective labels. Per
  // `CashoutOrderProcessor.resolveDispute`, RESOLVED_LP_PAYS happens on
  // REFUND_TO_RESPONDENT (vendor lost dispute) → USDC released to LP.
  // RESOLVED_VENDOR_PAYS happens on RELEASE_TO_CLAIMANT or SLASH_LP
  // (vendor wins) → USDC refunded to vendor. Previous "LP paid" label
  // read ambiguously as "LP completed payout (success)"; rewritten so a
  // vendor reading the row can't mistake it for the opposite outcome.
  RESOLVED_LP_PAYS: "Resolved · LP retained funds",
  RESOLVED_VENDOR_PAYS: "Resolved · refunded to you",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export default async function CashoutPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const query = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { vendor, simulated } = session;

  const invoices = await listInvoicesForVendor(vendor.id);
  const cashouts = await listCashoutsForVendor(vendor.id);
  const balances = mockComputeBalances(invoices, cashouts);

  // Mobile: render the most-recent cashout's state-driven panel (quote → live → complete → dispute)
  // OR show the "request new cashout" quote builder if none in-flight.
  const activeCashout = cashouts.find(
    (c) =>
      c.status !== "RELEASED" &&
      c.status !== "RESOLVED_LP_PAYS" &&
      c.status !== "RESOLVED_VENDOR_PAYS" &&
      c.status !== "EXPIRED" &&
      c.status !== "CANCELLED",
  );
  const lastCashout = cashouts[0];

  return (
    <>
      <div className="md:hidden">
        <div className="px-4 py-6">
          <MobileCashout
            active={activeCashout}
            last={lastCashout}
            cashoutable={balances.cashoutable}
            vendorWallet={vendor.wallet}
            forceQuote={query.new === "1"}
          />
        </div>
      </div>

      <main className="hidden md:block">
        <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
          <header>
            <div className="flex items-center gap-2">
              <Eyebrow>Cashout</Eyebrow>
              {simulated ? <Badge tone="sim">Simulated session</Badge> : null}
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              USDC in. Local currency out.
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              India payout pilot live first. Other corridors run as
              adapter-ready simulations until each licensed partner switches on.
              Klaro is not a bank.
            </p>
          </header>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                Request a cashout
              </h2>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
                <p className="mb-4 text-sm">
                  <span className="text-[var(--color-ink-subtle)]">
                    Available to cash out:
                  </span>{" "}
                  <strong className="font-display text-lg">
                    {formatUSDC(balances.cashoutable)}
                  </strong>
                </p>
                <CashoutRequestForm
                  maxUsdc={balances.cashoutable}
                  vendorWallet={vendor.wallet}
                />
              </div>

              <h2 className="mt-10 mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                Corridors
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CORRIDORS.map((c) => (
                  <li
                    key={c.code}
                    className="flex items-center justify-between rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 text-xs"
                  >
                    <span className="font-medium">
                      {c.code} · <span className="font-mono">{c.currency}</span>
                    </span>
                    <CorridorPill status={c.status} />
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                Your cashouts
              </h2>
              {cashouts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg)] p-8 text-center">
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    No cashouts yet. Request one above when you&rsquo;re ready.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cashouts.map((c) => {
                    const cor = getCorridor(c.currency);
                    return (
                      <li
                        key={c.id}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={
                                `/vendor/cashout/${c.id}` as `/vendor/cashout/${string}`
                              }
                              className="font-display text-base font-semibold hover:text-[var(--color-brand)]"
                            >
                              {formatUSDC(c.usdcAmount)} →{" "}
                              {cor
                                ? formatPayout(c.payoutMinor, cor)
                                : c.currency}
                            </Link>
                            <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                              {shortAddress(c.id)} ·{" "}
                              {relativeTime(c.requestedAt)}
                              {c.lpName ? ` · LP ${c.lpName}` : ""}
                            </p>
                          </div>
                          <Badge tone={STATUS_TONE[c.status]}>
                            {STATUS_LABEL[c.status]}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

/* ─── Mobile state machine for cashout ──────────────────────────────
 * One route renders 6 states based on the active cashout's status:
 * quote (no active) → designer 06-01
 * lp-pick (REQUESTED) → designer 06-02 (interim — we skip to LOCKED in mock)
 * order-live (LOCKED|CLAIMED) → designer 06-03
 * confirm-received (PROOF_SUBMITTED) → designer 06-04
 * complete (RELEASED|RESOLVED_LP_PAYS) → designer 06-05
 * dispute (DISPUTED) → designer 06-06
 */
function MobileCashout({
  active,
  last,
  cashoutable,
  vendorWallet,
  forceQuote,
}: {
  active?: CashoutOrder;
  last?: CashoutOrder;
  cashoutable: bigint;
  vendorWallet?: Hex | null;
  forceQuote: boolean;
}) {
  if (forceQuote)
    return (
      <MobileCashoutQuote
        cashoutable={cashoutable}
        vendorWallet={vendorWallet}
        last={last}
      />
    );
  if (
    !active &&
    last &&
    (last.status === "RELEASED" ||
      last.status === "RESOLVED_LP_PAYS" ||
      last.status === "RESOLVED_VENDOR_PAYS")
  )
    return <MobileCashoutComplete order={last} />;
  if (!active)
    return (
      <MobileCashoutQuote
        cashoutable={cashoutable}
        vendorWallet={vendorWallet}
        last={last}
      />
    );
  if (active.status === "DISPUTED")
    return <MobileCashoutDispute order={active} />;
  if (active.status === "PROOF_SUBMITTED")
    return <MobileCashoutConfirm order={active} />;
  if (active.status === "RELEASED" || active.status === "RESOLVED_LP_PAYS")
    return <MobileCashoutComplete order={active} />;
  return <MobileCashoutLive order={active} />;
}

function MobileCashoutQuote({
  cashoutable,
  vendorWallet,
  last,
}: {
  cashoutable: bigint;
  vendorWallet?: Hex | null;
  last?: CashoutOrder;
}) {
  return (
    <>
      <header>
        <Eyebrow>Cashout</Eyebrow>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          New request
        </h1>
      </header>

      {/* Real quote builder — the same live amount + corridor + computed-payout
          form the desktop renders. No fabricated amounts or payout account:
          "You receive" is derived from quoteCashout() as the vendor types. */}
      <div className="mt-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5">
        <p className="mb-4 text-sm">
          <span className="text-[var(--color-ink-subtle)]">
            Available to cash out:
          </span>{" "}
          <strong className="font-display text-lg">
            {formatUSDC(cashoutable)}
          </strong>
        </p>
        <CashoutRequestForm maxUsdc={cashoutable} vendorWallet={vendorWallet} />
      </div>

      {last && (
        <p className="mt-3 text-center text-xs text-[var(--color-ink-subtle)]">
          Last cashout: {formatUSDC(last.usdcAmount)} ·{" "}
          {relativeTime(last.requestedAt)}
        </p>
      )}
    </>
  );
}

function MobileCashoutLive({ order }: { order: CashoutOrder }) {
  return (
    <>
      <header>
        <Eyebrow>Order {shortAddress(order.id)}</Eyebrow>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Cashout in flight
        </h1>
      </header>
      <article className="mt-5 rounded-xl border border-[var(--color-brand)]/20 bg-[var(--color-brand-soft)] p-4">
        <p className="flex items-start gap-3 text-sm">
          <span
            aria-hidden
            className="mt-0.5 size-3 shrink-0 rounded-full bg-[var(--color-brand)]"
          />
          <span>
            <span className="font-medium text-[var(--color-brand)]">
              Simulated payout step in progress
            </span>
            <span className="mt-1 block text-[var(--color-ink-muted)]">
              No INR moves. {order.lpName ?? "LP"} submits demo proof for
              review.
            </span>
          </span>
        </p>
      </article>
      <article className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
          You'll receive
        </p>
        <div className="mt-1 flex items-end justify-between">
          <p className="font-display text-4xl font-semibold tracking-tight text-[var(--color-brand)]">
            ₹{(Number(order.payoutMinor) / 100).toLocaleString("en-IN")} demo
          </p>
          <p className="text-right text-xs text-[var(--color-ink-muted)]">
            From
            <br />
            <span className="font-mono text-sm text-[var(--color-ink)]">
              {formatUSDC(order.usdcAmount).split(".")[0]} USDC
            </span>
            <br />@ ₹{order.quoteRate.toFixed(2)}
          </p>
        </div>
      </article>
      <p className="mt-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
        Order timeline
      </p>
      <ol className="mt-3 rounded-xl border border-[var(--color-line)] bg-white">
        <CashoutTimelineRow done label="You confirmed" time="14:22" />
        <CashoutTimelineRow
          done
          label="Demo cashout order created"
          time="14:22"
        />
        <CashoutTimelineRow
          done
          label={`${order.lpName ?? "LP"} assigned (demo)`}
          time="14:23"
        />
        <CashoutTimelineRow
          active
          label={`${order.lpName ?? "LP"} submitting demo proof`}
          time="now"
        />
        <CashoutTimelineRow label="You confirm simulated outcome" time="—" />
        <CashoutTimelineRow label="Simulation completed" time="—" />
      </ol>
      <Link
        href="/vendor/disputes"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium"
      >
        Get support for this order
      </Link>
      <Link
        href={`/vendor/cashout/${order.id}`}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium"
      >
        View order details
      </Link>
    </>
  );
}

function MobileCashoutConfirm({ order }: { order: CashoutOrder }) {
  return (
    <>
      <Eyebrow>Confirm payment</Eyebrow>
      <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight">
        Did you receive ₹
        {(Number(order.payoutMinor) / 100).toLocaleString("en-IN")}?
      </h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Demo proof is ready for review. No transfer was sent to HDFC ••5421.
      </p>
      <article className="mt-5 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-4">
        <p className="flex items-center justify-between py-3 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
          Demo proof from {order.lpName ?? "LP"} <span>14:25 IST</span>
        </p>
        <RowMini
          k="Sent"
          v={`₹${(Number(order.payoutMinor) / 100).toLocaleString("en-IN")}`}
        />
        <RowMini k="Method" v="Simulated payout record" />
        <RowMini
          k="Demo ref"
          v={order.utrReference ?? "HDFC-2026-0524-…8211"}
          mono
        />
        <RowMini
          k="Note"
          v={`Klaro cashout · order ${shortAddress(order.id)}`}
        />
      </article>
      <div className="mt-3 grid h-32 place-items-center rounded-2xl border border-dashed border-[var(--color-line)] bg-white text-xs text-[var(--color-ink-subtle)]">
        Partner-submitted screenshot
        <br />
        (tap to expand)
      </div>
      <form action={confirmReceivedAction.bind(null, order.id)}>
        <button
          type="submit"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white hover:bg-black"
        >
          Yes — received, release simulated USDC
        </button>
      </form>
      <form action={openDisputeAction.bind(null, order.id)}>
        <button
          type="submit"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-rose-200 bg-white text-sm font-medium text-rose-600"
        >
          Not received — open dispute
        </button>
      </form>
    </>
  );
}

function MobileCashoutComplete({ order }: { order: CashoutOrder }) {
  const refundedToVendor = order.status === "RESOLVED_VENDOR_PAYS";
  return (
    <>
      <div className="grid place-items-center">
        <span
          aria-hidden
          className="grid size-20 place-items-center rounded-full bg-emerald-100 text-emerald-700"
        >
          <CheckIcon className="size-9" />
        </span>
      </div>
      <h1 className="mt-6 text-center font-display text-3xl font-semibold tracking-tight">
        {refundedToVendor ? "Dispute resolved" : "Cashout complete"}
      </h1>
      <p className="mt-2 text-center text-sm text-[var(--color-ink-muted)]">
        {refundedToVendor
          ? `${formatUSDC(order.usdcAmount)} was returned to the vendor in demo state. No funds moved.`
          : `₹${(Number(order.payoutMinor) / 100).toLocaleString("en-IN")} was marked complete in the simulator. No bank transfer occurred.`}
      </p>
      <dl className="mt-6 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-5">
        <RowMini
          k="Sent"
          v={`${formatUSDC(order.usdcAmount).split(".")[0].replace("$", "")} USDC`}
        />
        <RowMini
          k={refundedToVendor ? "Outcome" : "Received"}
          v={
            refundedToVendor
              ? "Vendor prevails (demo)"
              : `₹${(Number(order.payoutMinor) / 100).toLocaleString("en-IN")}`
          }
        />
        <RowMini k="Partner" v={order.lpName ?? "Aakash · Pune"} />
        <RowMini k="Receipt" v={shortAddress(order.quoteHash)} accent />
      </dl>
      <Link
        href={`/vendor/cashout/${order.id}`}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white"
      >
        View audit timeline
      </Link>
      <Link
        href="/vendor"
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium"
      >
        Back to home
      </Link>
      <Link
        href="/vendor/cashout?new=1"
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium"
      >
        Start another simulation
      </Link>
    </>
  );
}

async function MobileCashoutDispute({ order }: { order: CashoutOrder }) {
  // used to render fabricated
  // case data (`d-${year}-0524-411`, "Opened 14:27 · 2 min ago") and
  // route Add-evidence to the disputes LIST. Now resolves the real
  // case opened by `openDisputeAction` and links to its detail page.
  const { getByContext } = await import("@/lib/repo/disputes");
  const dispute = await getByContext("cashout", order.id);
  const caseShort = dispute ? shortAddress(dispute.caseId) : "(pending)";
  const openedRel = dispute
    ? relativeTime(dispute.openedAt)
    : "(awaiting record)";
  const caseHref = dispute
    ? (`/vendor/disputes/${dispute.caseId}` as `/vendor/disputes/${string}`)
    : ("/vendor/disputes" as const);
  return (
    <>
      <header>
        <Eyebrow>Dispute</Eyebrow>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Case opened
        </h1>
      </header>
      <article className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="flex items-start gap-3 text-sm">
          <span
            aria-hidden
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white"
          >
            !
          </span>
          <span>
            <span className="font-medium text-rose-900">
              Demo case opened · admin reviewing
            </span>
            <span className="mt-1 block text-rose-800/80">
              This exercises the review workflow only. No USDC, INR, or LP stake
              moves.
            </span>
          </span>
        </p>
      </article>
      <dl className="mt-4 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-4">
        <RowMini k="Case ID" v={caseShort} />
        <RowMini k="Opened" v={openedRel} />
        <RowMini k="Order" v={shortAddress(order.id)} />
        <RowMini
          k="Demo amount"
          v={`${formatUSDC(order.usdcAmount).split(".")[0].replace("$", "")} USDC`}
        />
        <RowMini k="SLA" v="< 24h · usually 2h" />
      </dl>
      <p className="mt-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
        What happens next
      </p>
      <ul className="mt-3 space-y-2">
        <li className="rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
          <p className="font-medium">Admin reviews demo proof + evidence</p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Both sides can test evidence submission
          </p>
        </li>
        <li className="rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
          <p className="font-medium">
            If the demo proof is accepted, complete the case
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Simulation completes · case closes
          </p>
        </li>
        <li className="rounded-xl border border-[var(--color-line)] bg-white p-4 text-sm">
          <p className="font-medium">
            If proof is rejected, record the decision
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            No fund movement occurs in simulator mode
          </p>
        </li>
      </ul>
      <Link
        href={caseHref}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white"
      >
        Add evidence
      </Link>
      <a
        href="mailto:prateek@myklaro.app?subject=Cashout%20dispute%20support"
        className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium"
      >
        Message admin
      </a>
    </>
  );
}

function CashoutTimelineRow({
  done,
  active,
  label,
  time,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
  time: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`inline-block size-2.5 rounded-full ${
            active
              ? "bg-[var(--color-brand)] ring-4 ring-[var(--color-brand)]/15"
              : done
                ? "bg-emerald-500"
                : "border-2 border-[var(--color-line)]"
          }`}
        />
        <span
          className={`text-sm ${done || active ? "font-medium" : "text-[var(--color-ink-muted)]"}`}
        >
          {label}
        </span>
      </div>
      <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
        {time}
      </span>
    </li>
  );
}

function RowMini({
  k,
  v,
  mono,
  accent,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="text-[var(--color-ink-muted)]">{k}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${accent ? "text-[var(--color-brand)]" : "text-[var(--color-ink)]"}`}
      >
        {v}
      </dd>
    </div>
  );
}

function CorridorPill({
  status,
}: {
  status: import("@/lib/corridors").CorridorStatus;
}) {
  const tone: Record<typeof status, "live" | "info" | "neutral" | "sim"> = {
    live: "live",
    pilot: "info",
    "access-gated": "info",
    simulation: "sim",
  };
  const label: Record<typeof status, string> = {
    live: "Live",
    pilot: "INR pilot",
    "access-gated": "Access-gated",
    simulation: "Sim",
  };
  return <Badge tone={tone[status]}>{label[status]}</Badge>;
}
