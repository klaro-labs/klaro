import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Reputation · Klaro",
  description: "On-chain financing-readiness signal. Open-source scoring from settlement quality, volume, and dispute history.",
};

const FACTORS = [
  { title: "Settlement quality", desc: "How consistently invoices settle on time without disputes or refunds." },
  { title: "Volume and velocity", desc: "Total settled USDC and the cadence of invoice activity over time." },
  { title: "Customer diversity", desc: "Number of unique counterparties — concentration risk lowers the score." },
  { title: "Dispute history", desc: "Disputes opened, won, lost. Clean history compounds into a higher signal." },
  { title: "KYB depth", desc: "Verified business identity, documents on file, and wallet hygiene." },
  { title: "Wallet hygiene", desc: "Single-purpose wallets, no mixing with DeFi, clean transaction history." },
];

export default function ProductReputationPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Reputation"
        chips={["Live testnet", "Open-source scoring"]}
        title="A score you can audit."
        sub="Klaro computes a financing-readiness signal from on-chain settlement data. The algorithm is open-source. The inputs are verifiable. The score is yours."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "View contract", href: "https://github.com/klaro-labs/klaro", variant: "secondary" },
        ]}
      />
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Inputs you can audit
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Six factors. All on-chain.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FACTORS.map((f) => (
            <FeatureCard key={f.title} title={f.title}>
              {f.desc}
            </FeatureCard>
          ))}
        </div>
      </section>
      <FinalCta />
      <Footer />
    </main>
  );
}
