import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "StableFX · Klaro",
  description: "Cross-chain stablecoin routing via CCTP V2 with Arc as the settlement hub.",
};

const FEATURES = [
  { title: "Sub-second finality on Arc", desc: "Arc's deterministic finality means your USDC settles in under a second — no 12-block waits." },
  { title: "CCTP V2 burn-and-mint", desc: "Circle's Cross-Chain Transfer Protocol moves USDC natively between chains without wrapped tokens." },
  { title: "Local rails · 2026 H2", desc: "Partner-operated local-currency rails are in development. Corridors activate as partners sign." },
];

export default function ProductStableFXPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="StableFX"
        chips={["Simulated", "CCTP V2", "Arc hub"]}
        title="Cross-chain stablecoin routing."
        sub="Source chain in. Arc as hub. Local rail out. CCTP V2 handles the cross-chain hop; Klaro handles the last mile."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "See cashout", href: "/product/cashout", variant: "secondary" },
        ]}
      />
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          How it works
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Three hops. One settlement.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
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
