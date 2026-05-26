import Link from "next/link";
import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

/**
 * §8 Partner Cashout INR — order timeline + 5 trust pillars.
 * Order data is illustrative; replaces with real cashout sim state in M6.
 */

const TIMELINE = [
  { t: "14:22:08", e: "Demo cashout created", done: true },
  { t: "14:22:14", e: "Simulated LP assigned", done: true },
  { t: "14:25:46", e: "Demo proof submitted", done: true },
  { t: "in progress", e: "Waiting for your demo decision", done: false },
  { t: "review", e: "Simulated dispute available", done: false },
  { t: "complete", e: "Outcome recorded in demo state", done: false },
];

const PILLARS = [
  {
    n: "01",
    title: "Live mode enforces escrow before release",
    body: "In live-contract mode, funds lock on Arc and release only after vendor confirmation or an enforced dispute decision. Simulated proof never releases funds.",
  },
  {
    n: "02",
    title: "LPs are staked, scored, and invite-only",
    body: "The contract design supports staked LPs and disputes. Testnet partner onboarding and KYB remain simulation-only until integrations are configured.",
  },
  {
    n: "03",
    title: "Proof, not promises",
    body: "A testnet cashout can submit a proof for review. Without a live verifier, it remains pending and cannot trigger release.",
  },
  {
    n: "04",
    title: "Dispute rules are designed to fail closed",
    body: "The demo exercises evidence review without moving funds. In live mode, an enforced onchain outcome is required before release or refund.",
  },
  {
    n: "05",
    title: "Klaro is not a bank",
    body: "Partner payout availability, fees, settlement times, and verification depend on the licensed payout partner — not Klaro.",
  },
];

export function PartnerCashout() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(80px,12vw,160px)]">
      <SectionHeader
        eyebrow="Partner Cashout · India pilot"
        title={
          <>
            USDC in. Rupees out.
            <br />
            Every step provable.
          </>
        }
        lede="Vendors can preview a cashout, proof-review, and dispute workflow. In live mode only, verified outcomes would govern escrow release or refund."
        className="max-w-3xl"
      />
      <p className="mt-3 max-w-2xl text-sm text-[var(--color-ink-subtle)]">
        Testnet uses mock proof. No real INR moves until our compliant payout
        partner is live.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <CashoutOrder />
        <ul className="space-y-6">
          {PILLARS.map((p) => (
            <li key={p.n}>
              <p className="font-mono text-xs text-[var(--color-brand)]">
                {p.n}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CashoutOrder() {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        <span>cashout.klaro.so · order #c7-d3-22</span>
        <Badge tone="sim">Testnet simulation</Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-[var(--color-ink-subtle)]">You give</p>
          <p className="mt-1 font-display text-3xl font-semibold">2,400</p>
          <p className="text-xs text-[var(--color-ink-muted)]">USDC · demo</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-ink-subtle)]">You receive</p>
          <p className="mt-1 font-display text-3xl font-semibold">₹2,01,360</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            INR · simulated
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs text-[var(--color-ink-muted)]">
        <dt>LP rate</dt> <dd className="text-[var(--color-ink)]">83.90</dd>
        <dt>LP spread</dt> <dd className="text-[var(--color-ink)]">0.40%</dd>
        <dt>Klaro fee</dt> <dd className="text-[var(--color-ink)]">0.30%</dd>
        <dt>Quote expires</dt> <dd className="text-[var(--color-ink)]">1:47</dd>
      </dl>

      <div className="mt-6 border-t border-[var(--color-line)] pt-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Order timeline
        </p>
        <ol className="mt-3 space-y-2">
          {TIMELINE.map((s) => (
            <li
              key={s.e}
              className="flex items-baseline justify-between text-xs"
            >
              <span
                className={
                  s.done
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)]"
                }
              >
                <span
                  aria-hidden
                  className={`mr-2 ${s.done ? "text-emerald-500" : "text-[var(--color-ink-subtle)]"}`}
                >
                  {s.done ? "✓" : "○"}
                </span>
                {s.e}
              </span>
              <span className="text-[var(--color-ink-subtle)]">{s.t}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/vendor/cashout" className={buttonVariants({ size: "md" })}>
          Try simulated cashout
        </Link>
        <Link
          href="/vendor/disputes"
          className={buttonVariants({ size: "md", variant: "secondary" })}
        >
          Open dispute
        </Link>
      </div>
    </article>
  );
}
