import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Cashout · Klaro",
  description: "Turn USDC into local currency through verified liquidity partners. Escrow-protected, dispute-ready.",
};

const STEPS = [
  { title: "Submit request", desc: "Vendor picks an amount and corridor. Klaro locks USDC in escrow on Arc." },
  { title: "LP picks up", desc: "A verified liquidity partner claims the order and submits local-rail proof." },
  { title: "Confirm + release", desc: "Vendor confirms receipt of local currency. Escrow releases USDC to the LP." },
];

export default function ProductCashoutPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Cashout"
        chips={["Testnet pilot", "LP marketplace · invite-only"]}
        title="USDC in. Local currency out."
        sub="Vendors turn USDC into rupees, reais, or euros through verified liquidity partners. Every step is escrowed, provable, and dispute-ready."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Become an LP", href: "/lp", variant: "secondary" },
        ]}
      />
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          How cashout works
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Three steps. Every one provable.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <FeatureCard key={s.title} title={`${String(i + 1).padStart(2, "0")} · ${s.title}`}>
              {s.desc}
            </FeatureCard>
          ))}
        </div>
        <div className="mt-16 rounded-[var(--klaro-tile-radius)] border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] p-8 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Corridors · partner-pending
          </p>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Inviting LP partners for INR, BRL, EUR, and NGN corridors.
            Email <a href="mailto:lp@klaro.so" className="text-[var(--color-klaro-orange)] hover:underline">lp@klaro.so</a> to apply.
          </p>
        </div>
      </section>
      <FinalCta />
      <Footer />
    </main>
  );
}
