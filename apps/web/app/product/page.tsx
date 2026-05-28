import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { TrustStrip } from "@/components/klaro/sections/TrustStrip";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Product · Klaro",
  description:
    "Five surfaces, one balance. Klaro is the Arc-native payment OS for vendors who invoice globally in USDC.",
};

type Stage = "live testnet" | "simulated" | "partner-pending";

const SURFACES: Array<{
  num: string;
  title: string;
  href: Route;
  one: string;
  desc: string;
  stage: Stage;
}> = [
  {
    num: "01",
    title: "Invoicing",
    href: "/product/invoicing",
    one: "Hosted USDC invoices.",
    desc:
      "Issue an invoice. Customer pays from any chain. CCTP V2 sweeps USDC home to Arc with sub-second finality. Quote freeze locks the rate for 15 minutes.",
    stage: "live testnet",
  },
  {
    num: "02",
    title: "Receipts",
    href: "/product/receipts",
    one: "Stenn-Proof receipts.",
    desc:
      "Every payment mints a public on-chain receipt. Both parties sign. Anyone can verify against Arc without trusting Klaro, the vendor, or the buyer.",
    stage: "live testnet",
  },
  {
    num: "03",
    title: "Cashout",
    href: "/product/cashout",
    one: "USDC into local money.",
    desc:
      "Verified liquidity partners pick up cashout orders against Klaro's escrow. The full state machine — quote, lock, LP assign, proof, confirm — ships today.",
    stage: "partner-pending",
  },
  {
    num: "04",
    title: "StableFX",
    href: "/product/stablefx",
    one: "Cross-chain stablecoin routing.",
    desc:
      "CCTP V2 burn-and-mint with Arc as the settlement hub. Adapter registry routes every (srcToken, dstToken) pair. No wrapped tokens.",
    stage: "partner-pending",
  },
  {
    num: "05",
    title: "Reputation",
    href: "/product/reputation",
    one: "A score you can audit.",
    desc:
      "Twelve signed event kinds — settlement, disputes, refunds, KYB — recorded on-chain. Anyone can sum them. No model; the score is the math.",
    stage: "live testnet",
  },
];

const STAGE_STYLES: Record<Stage, string> = {
  "live testnet":
    "bg-[color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[var(--color-success)]",
  simulated: "bg-[var(--color-bg-warm)] text-[var(--color-muted)] border border-[var(--color-line)]",
  "partner-pending": "bg-[var(--color-klaro-gold-soft)] text-[var(--color-klaro-gold-deep)]",
};

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Product"
        title="Five surfaces, one balance."
        sub="Klaro is the Arc-native payment OS for vendors who invoice globally in USDC, prove every payment on-chain, and cash out through verified partners."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "See pricing", href: "/pricing", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
              Surfaces
            </p>
            <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
              Everything a vendor needs to get paid and prove it.
            </h2>
          </div>
          <p className="max-w-md text-sm text-[var(--color-muted)]">
            Each surface ships behind the same wallet and shares one balance.
            Stages are honest per principle 8 — no marketing-grade claims hidden
            in the small print.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.title}
              href={s.href}
              className="group flex h-full flex-col rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-[var(--klaro-tile-pad)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-klaro-orange-soft)] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  {s.num}
                </span>
                <span
                  className={`inline-flex rounded-pill px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${STAGE_STYLES[s.stage]}`}
                >
                  {s.stage}
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-1 font-display text-base font-medium text-[var(--color-ink-2)]">
                {s.one}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                {s.desc}
              </p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-klaro-orange)]">
                Open {s.title.toLowerCase()}
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <TrustStrip />
      <FinalCta />
      <Footer />
    </main>
  );
}
