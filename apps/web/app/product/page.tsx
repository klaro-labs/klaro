import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { TrustStrip } from "@/components/klaro/sections/TrustStrip";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Product · Klaro",
  description:
    "Five surfaces, one balance. Klaro is the Arc-native payment OS for vendors who invoice globally in USDC.",
};

const SURFACES = [
  {
    title: "Invoicing",
    href: "/product/invoicing",
    desc: "Issue hosted invoices in USDC. Multi-chain receive via CCTP V2. Quote freeze locks the rate for 15 minutes.",
  },
  {
    title: "Receipts",
    href: "/product/receipts",
    desc: "On-chain proof of every payment. Both parties sign. Verifiable by anyone without trusting Klaro.",
  },
  {
    title: "Cashout",
    href: "/product/cashout",
    desc: "Turn USDC into local currency through verified liquidity partners. Escrow-protected, dispute-ready.",
  },
  {
    title: "StableFX",
    href: "/product/stablefx",
    desc: "Cross-chain stablecoin routing. CCTP V2 burn-and-mint with Arc as the settlement hub.",
  },
  {
    title: "Reputation",
    href: "/product/reputation",
    desc: "On-chain financing-readiness signal. Open-source scoring from settlement quality, volume, and dispute history.",
  },
];

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
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Surfaces
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Everything a vendor needs to get paid and prove it.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((s) => (
            <FeatureCard key={s.title} title={s.title} href={s.href}>
              {s.desc}
            </FeatureCard>
          ))}
        </div>
      </section>
      <TrustStrip />
      <FinalCta />
      <Footer />
    </main>
  );
}
