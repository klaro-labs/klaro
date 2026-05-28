import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { REPUTATION_MANAGER_ADDRESS } from "@/lib/env";

export const metadata: Metadata = {
  title: "Reputation · Klaro",
  description: "Open-source on-chain reputation signal. 12 audited event kinds, signed weights, summed by VendorReputation.sol.",
};

// Mirrors VendorReputation.Kind in packages/contracts/src/VendorReputation.sol.
// 12 active kinds (enum index 1..12); NONE is reserved.
// Sign reflects how the kind moves the running total per the contract comments.
type FactorSign = "positive" | "negative" | "either";
const FACTORS: Array<{ kind: string; sign: FactorSign; desc: string }> = [
  { kind: "INVOICE_SETTLED", sign: "positive", desc: "Invoice paid on time. The primary positive signal in the model." },
  { kind: "INVOICE_SETTLED_LATE", sign: "positive", desc: "Paid eventually — counts, but at a reduced weight vs on-time." },
  { kind: "CASHOUT_RELEASED", sign: "positive", desc: "Successful cashout. Vendor confirmed local-rail receipt." },
  { kind: "AGENT_JOB_CLOSED", sign: "positive", desc: "Agent escrow job closed cleanly. ERC-8183 settlement track." },
  { kind: "KYB_PASSED", sign: "positive", desc: "Business identity verified through Klaro's KYB process." },
  { kind: "DISPUTE_WON", sign: "positive", desc: "Dispute decided in the vendor's favour by the operator." },
  { kind: "DISPUTE_OPENED", sign: "negative", desc: "Dispute filed against the vendor. Small penalty pending outcome." },
  { kind: "DISPUTE_LOST", sign: "negative", desc: "Dispute decided against the vendor. Larger penalty than DISPUTE_OPENED." },
  { kind: "REFUND_ISSUED", sign: "negative", desc: "Vendor issued a refund. Small penalty — refunds happen, but track them." },
  { kind: "SLASH_PENALTY", sign: "negative", desc: "Operator-applied penalty for breach. Largest single negative impact." },
  { kind: "KYB_REVOKED", sign: "negative", desc: "KYB withdrawn. Largest negative — usually the start of an off-ramp." },
  { kind: "MANUAL_ADJUST", sign: "either", desc: "Operator-only correction with a ReasonCodes hash. Either direction; always logged with reason." },
];

const TIERS = [
  { name: "Bronze", min: "0+", desc: "New vendors. Standard payment limits." },
  { name: "Silver", min: "500+", desc: "Established. Eligible for faster cashout queue." },
  { name: "Gold", min: "2,000+", desc: "Trusted. Eligible for advance-pay rails when they ship." },
  { name: "Platinum", min: "10,000+", desc: "Top tier. Lowest fees and priority dispute review." },
];

const IMPROVERS = [
  {
    title: "Settle invoices on time",
    desc: "On-time settlement is the heaviest positive signal. Recurring on-time payments compound faster than one-off big invoices.",
  },
  {
    title: "Defend disputes with proof",
    desc: "DISPUTE_WON cancels the DISPUTE_OPENED penalty and adds positive weight. Sign every delivery; ship a Stenn-Proof receipt.",
  },
  {
    title: "Keep KYB current",
    desc: "KYB_PASSED stays additive until revoked. Re-verify documents before they expire so the score doesn't take a KYB_REVOKED hit.",
  },
];

const EXPLORER_BASE = "https://explorer.arc.network/address";

export default function ProductReputationPage() {
  const addr = REPUTATION_MANAGER_ADDRESS;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Reputation"
        chips={["Live testnet", "Open-source scoring"]}
        title="A score you can audit."
        sub="Klaro emits 12 signed event kinds to an on-chain VendorReputation contract. Anyone can sum them. There is no model — the score is the math."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Read the contract", href: "https://github.com/klaro-labs/klaro/blob/main/packages/contracts/src/VendorReputation.sol", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Inputs you can audit
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Twelve event kinds. All emitted on-chain.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-muted)]">
          Every event the contract accepts is listed below. Weights are signed integers set by the operator at emit time —
          mutable per-event but never per-vendor, so the same action moves every vendor's score equally.
        </p>

        <ul className="mt-10 grid gap-3 md:grid-cols-2">
          {FACTORS.map((f) => (
            <li
              key={f.kind}
              className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] font-medium tracking-tight">
                  {f.kind}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${
                    f.sign === "positive"
                      ? "bg-[color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[var(--color-success)]"
                      : f.sign === "negative"
                      ? "bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] text-[var(--color-danger)]"
                      : "bg-[var(--color-bg-warm)] text-[var(--color-muted)] border border-[var(--color-line)]"
                  }`}
                >
                  {f.sign === "positive" ? "+ weight" : f.sign === "negative" ? "− weight" : "± weight"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {f.desc}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Tiers
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Four bands. No surprises.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5"
            >
              <p className="font-display text-xl font-semibold tracking-tight">{t.name}</p>
              <p className="mt-1 font-mono text-[12px] text-[var(--color-muted)]">{t.min}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          How to improve your score
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Three habits that move the math.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {IMPROVERS.map((i, idx) => (
            <div
              key={i.title}
              className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5"
            >
              <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--color-klaro-orange)]">
                {String(idx + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">
                {i.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {i.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            On-chain
          </p>
          {addr ? (
            <a
              href={`${EXPLORER_BASE}/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex break-all font-mono text-sm font-medium text-[var(--color-klaro-orange)] hover:underline"
            >
              {addr}
            </a>
          ) : (
            <p className="mt-2 font-mono text-sm text-[var(--color-muted)]">
              Contract address pending testnet deploy
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
            The address above is the live <span className="font-mono">ReputationManager</span> on Arc testnet.
            Read the running total for any vendor by calling{" "}
            <span className="font-mono">getReputation(vendorId)</span>. The math is open — no signal we use is hidden from the vendor or the lender.
          </p>
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
