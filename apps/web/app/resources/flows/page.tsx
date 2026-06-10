import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Pill } from "@/components/ui/Pill";

export const metadata: Metadata = {
  title: "User flows · Klaro",
  description:
    "State machines for every Klaro flow — invoice creation, customer payment, cashout order, dispute, LP onboarding, cross-chain receive. Sourced from the canonical flow spec.",
};

type Status = "live testnet" | "simulated" | "lab preview";

interface Flow {
  /** Section number in Klaro_Final_Testnet_Complete_Full_Flow_Design_v2.md */
  section: string;
  name: string;
  /** One-sentence purpose, in the voice of the doc. */
  summary: string;
  roles: string[];
  /** Canonical state names — kept in sync with `lib/workflows/*.ts` once it lands. */
  states: string[];
  /** Ordered timeline the user actually sees on screen. */
  timeline: string[];
  /** Where the flow breaks and what we show. */
  stuck?: Array<{ when: string; message: string }>;
  status: Status;
}

const FLOWS: Flow[] = [
  {
    section: "§11",
    name: "Invoice creation",
    summary:
      "Vendor drafts an invoice, picks settlement assets, and shares a hosted link. Buyer acceptance hash is prepared at creation time so the receipt can later prove both sides.",
    roles: ["Vendor"],
    states: [
      "Draft",
      "Open",
      "PaymentStarted",
      "PartiallyFunded",
      "Funded",
      "Screening",
      "Held",
      "Released",
      "Settled",
      "Refunded",
      "Expired",
      "Disputed",
      "Cancelled",
      "Rejected",
      "Voided",
    ],
    timeline: [
      "Created",
      "Shared",
      "Viewed",
      "Payment started",
      "Paid",
      "Screening",
      "Released",
      "Receipt ready",
    ],
    stuck: [
      { when: "Invoice open, not viewed", message: "Send first reminder via copy-link / WhatsApp / email." },
      { when: "Viewed, not paid", message: "Send payment nudge with hosted link." },
      { when: "Invoice expired", message: "Suggest creating a fresh invoice." },
    ],
    status: "live testnet",
  },
  {
    section: "§12",
    name: "Customer invoice payment",
    summary:
      "Customer opens the hosted invoice, reviews who is asking for money, accepts the invoice in plain language (EIP-712 for wallets, magic-link for email payers), and pays in USDC on Arc or any supported chain.",
    roles: ["Buyer", "Vendor"],
    states: ["Reviewing", "Accepted", "Paying", "PartiallyFunded", "Funded", "Settled", "Refunded"],
    timeline: [
      "Preparing payment",
      "Waiting for wallet",
      "Moving funds",
      "Confirming on Arc",
      "Payment received",
      "Receipt ready",
    ],
    stuck: [
      { when: "Wrong chain", message: "Switch chain or use cross-chain payment route." },
      { when: "Insufficient gas", message: "Explain Arc uses USDC for gas and show how to fund." },
      { when: "Underpaid", message: "Show remaining amount and pay-remainder action." },
      { when: "Overpaid", message: "Auto-refund excess; admin only if auto-refund fails." },
    ],
    status: "live testnet",
  },
  {
    section: "§13",
    name: "Cross-chain receive",
    summary:
      "Customer has USDC on another chain. App Kit unified balance or CCTP V2 route the funds to Arc without making the buyer learn bridge mechanics.",
    roles: ["Buyer"],
    states: ["Initiated", "Routed", "Settled", "Failed"],
    timeline: [
      "Detect source chain & balance",
      "Pick unified balance or CCTP",
      "Customer confirms",
      "USDC made spendable on Arc",
      "Escrow Funded",
    ],
    status: "simulated",
  },
  {
    section: "§20·§21",
    name: "Cashout quote → order",
    summary:
      "Vendor opens Partner Cashout, picks INR, sees a 60–120s rate quote (rate · LP spread · Klaro fee · expiry), then locks the order. LP fills off-platform and submits proof.",
    roles: ["Vendor", "LP"],
    states: [
      "Requested",
      "Quoted",
      "Locked",
      "LPAssigned",
      "PayoutSent",
      "ProofSubmitted",
      "Verifying",
      "WaitingVendorConfirmation",
      "Released",
      "Refunded",
      "Disputed",
      "Expired",
      "Cancelled",
    ],
    timeline: [
      "Quote created",
      "USDC locked",
      "LP assigned",
      "Payout sent",
      "Proof submitted",
      "Vendor confirms / proof verified",
      "USDC released to LP",
    ],
    stuck: [
      { when: "No LP assigned", message: "Show \"Looking for LP\"; let vendor cancel before lock." },
      { when: "LP late on proof", message: "Surface support case with SLA and case ID." },
      { when: "Proof rejected", message: "LP resubmits; vendor sees state change." },
      { when: "Amount / name mismatch", message: "Freeze and escalate to admin/risk review." },
    ],
    status: "simulated",
  },
  {
    section: "§25",
    name: "Cashout dispute",
    summary:
      "Either party opens a dispute from a fixed reason list. The order freezes, USDC stays in escrow, and an admin case opens with a deadline and an evidence checklist.",
    roles: ["Vendor", "LP", "Operator"],
    states: ["Opened", "EvidenceRequested", "EvidenceSubmitted", "UnderReview", "Decided", "Released", "Refunded", "Slashed"],
    timeline: [
      "Opened with reason code",
      "Evidence requested",
      "Evidence submitted",
      "Under admin review",
      "Decision made",
      "Funds released / refunded / slashed",
    ],
    stuck: [
      { when: "Awaiting evidence", message: "Show deadline countdown + missing-evidence checklist." },
      { when: "Admin review delayed", message: "Surface SLA and case ID; both sides notified." },
    ],
    status: "simulated",
  },
  {
    section: "§14·§15",
    name: "Screening & receipt mint",
    summary:
      "On funding, Klaro runs screening against the buyer wallet and payment trail. On pass, the escrow releases to vendor and a Stenn-Proof receipt is minted with hashes of invoice + buyer acceptance + screening result.",
    roles: ["System", "Operator"],
    states: ["Pending", "Passed", "Held", "Released", "Minted", "Verified"],
    timeline: [
      "Screen wallet + chain trail",
      "Pass → release to vendor",
      "Mint receipt with proof bundle",
      "Anchor on Arc",
      "Public receipt page live",
    ],
    status: "live testnet",
  },
  {
    section: "§22",
    name: "LP onboarding",
    summary:
      "LPs are invite-only. Application → review → stake deposit → activation. Designed to feel like partner onboarding, not consumer signup.",
    roles: ["LP", "Operator"],
    states: ["Invited", "ApplicationStarted", "Submitted", "UnderReview", "Approved", "Rejected", "StakeRequired", "Active", "Suspended"],
    timeline: [
      "Invite received",
      "Application + docs submitted",
      "Review (wallet risk, payout proof, source-of-funds)",
      "Approval + stake required",
      "Stake deposited → active",
    ],
    status: "simulated",
  },
];

const STATUS_TONE: Record<Status, "warm" | "default" | "outline"> = {
  "live testnet": "warm",
  simulated: "default",
  "lab preview": "outline",
};

const STATUS_DOT: Record<Status, "live" | "muted" | "warm"> = {
  "live testnet": "live",
  simulated: "muted",
  "lab preview": "warm",
};

export default function FlowsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="User flows"
        chips={["State machines · sourced from spec v2"]}
        title="How Klaro actually works."
        sub="Every money flow is a state machine. These are the canonical journeys with their states, on-screen timelines, and stuck-state handling, taken straight from our flow specification."
      />

      <section className="klaro-container pb-20">
        <ol className="space-y-6">
          {FLOWS.map((f) => (
            <FlowCard key={f.section + f.name} flow={f} />
          ))}
        </ol>

        <aside className="mt-12 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6 md:p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
            How to read this
          </p>
          <ul className="mt-4 grid gap-3 text-sm text-[var(--color-muted)] md:grid-cols-2">
            <li>
              <span className="font-medium text-[var(--color-ink)]">States</span> are the canonical enum values stored against the record. They map to webhook event names and admin search filters.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Timeline</span> is what the user sees in plain language &mdash; one row per visible status change.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Stuck states</span> are documented escalation paths. No silent failures (principle 15).
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Status pills</span> follow principle 8 &mdash; <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">live testnet</code>, <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">simulated</code>, or <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">lab preview</code>.
            </li>
          </ul>
        </aside>
      </section>

      <Footer />
    </main>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  return (
    <li className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 md:p-8">
      {/* Header — section, name, status */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--color-muted)]">{flow.section}</span>
            <h3 className="font-display text-xl font-semibold tracking-tight">{flow.name}</h3>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-muted)]">
            {flow.summary}
          </p>
        </div>
        <Pill tone={STATUS_TONE[flow.status]} size="sm" dot={STATUS_DOT[flow.status]}>
          {flow.status}
        </Pill>
      </header>

      {/* Roles */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Roles
        </span>
        {flow.roles.map((r) => (
          <span
            key={r}
            className="rounded-pill border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-0.5 text-xs text-[var(--color-ink-2)]"
          >
            {r}
          </span>
        ))}
      </div>

      {/* State machine */}
      <div className="mt-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
          States
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {flow.states.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="rounded bg-[var(--color-bg-warm)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-2)]">
                {s}
              </span>
              {i < flow.states.length - 1 && (
                <span aria-hidden className="text-xs text-[var(--color-muted)]">
                  /
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline — what the user actually sees */}
      <div className="mt-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
          On-screen timeline
        </span>
        <ol className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
          {flow.timeline.map((t, i) => (
            <li
              key={t}
              className="flex items-start gap-3 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2"
            >
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-klaro-orange-soft)] font-mono text-[10px] font-semibold text-[var(--color-klaro-orange-deep)]"
              >
                {i + 1}
              </span>
              <span className="text-xs text-[var(--color-ink-2)]">{t}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Stuck states */}
      {flow.stuck && flow.stuck.length > 0 && (
        <div className="mt-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Stuck-state handling
          </span>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {flow.stuck.map((s) => (
              <div
                key={s.when}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-3"
              >
                <dt className="font-mono text-[11px] text-[var(--color-ink-2)]">{s.when}</dt>
                <dd className="mt-1 text-xs text-[var(--color-muted)]">{s.message}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}
