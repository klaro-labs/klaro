import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Pill } from "@/components/ui/Pill";
import { buttonVariants } from "@/components/ui/Button";
import Link from "next/link";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Pricing · Klaro",
  description: "Free on testnet. 1% on mainnet. No monthly fee, no setup fee, no per-seat fee.",
};

const TIERS = [
  {
    name: "Testnet",
    price: "Free",
    sub: "All features. No caps. Testnet tokens only.",
    features: [
      "Unlimited invoices",
      "On-chain receipts",
      "Cashout simulation",
      "Reputation scoring",
      "Multi-chain receive",
      "Community support",
    ],
    cta: { label: "Open workspace", href: "/signin" },
    highlight: false,
  },
  {
    name: "Standard",
    price: "1.0%",
    sub: "Flat on settled volume. No monthly fee. Partner-payout fees passed through.",
    features: [
      "Everything in Testnet",
      "Live USDC settlement",
      "Partner cashout corridors",
      "Webhook delivery + retries",
      "Priority support · 4h SLA",
      "Audit log retention · 2 years",
    ],
    cta: { label: "Open workspace", href: "/signin" },
    highlight: true,
  },
  {
    name: "Scale",
    price: "Custom",
    sub: "For platforms reselling Klaro or LPs running large payout networks.",
    features: [
      "Everything in Standard",
      "White-label invoicing",
      "Dedicated infrastructure",
      "Custom screening rules",
      "24×7 on-call rotation",
      "Named CSM + SOC reporting",
    ],
    cta: { label: "Talk to sales", href: "mailto:sales@klaro.so" },
    highlight: false,
  },
];

const FAQ = [
  { q: "When does mainnet pricing start?", a: "After the external security audit completes and mainnet deploys. Until then, testnet is free for everyone." },
  { q: "What counts as settled volume?", a: "USDC that moves through InvoiceEscrow and reaches the vendor's wallet. Refunded or disputed amounts are excluded." },
  { q: "Are there per-invoice or per-seat fees?", a: "No. The 1% fee is the only charge. No monthly minimum, no per-user pricing, no hidden FX markup." },
  { q: "What about cashout fees?", a: "LP spread and Klaro's cashout fee (0.3%) are separate from the 1% invoice fee. Both are shown before you confirm." },
  { q: "Can I try before committing?", a: "Yes. Testnet is free and unlimited. Create invoices, simulate cashouts, and test the full flow without spending anything." },
  { q: "Do you offer discounts for high volume?", a: "The Scale tier is custom-priced. Email sales@klaro.so with your expected monthly volume." },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Pricing"
        chips={["Testnet free forever"]}
        title="Pay what you actually pay."
        sub="No monthly fee. No setup fee. No per-seat fee. No FX markup we don't disclose. During testnet every feature is free."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Talk to sales", href: "mailto:sales@klaro.so", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <article
              key={t.name}
              className={cn(
                "rounded-[var(--klaro-tile-radius)] p-[var(--klaro-tile-pad)]",
                t.highlight
                  ? "bg-[var(--color-ink)] text-white"
                  : "border border-[var(--color-line)] bg-[var(--color-bg-elevated)]",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                {t.highlight && <Pill tone="gold" size="sm">Mainnet target</Pill>}
              </div>
              <p className="mt-6 font-display text-5xl font-semibold tracking-tight">
                {t.price}
              </p>
              <p className={cn("mt-3 text-sm", t.highlight ? "text-white/70" : "text-[var(--color-muted)]")}>
                {t.sub}
              </p>
              <ul className="mt-7 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className={cn("flex items-start gap-2", t.highlight ? "text-white/80" : "text-[var(--color-muted)]")}>
                    <span className={t.highlight ? "text-[var(--color-klaro-gold)]" : "text-[var(--color-klaro-orange)]"}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href={t.cta.href as "/signin"}
                  className={cn(
                    buttonVariants({ size: "md", variant: "secondary" }),
                    "w-full",
                    t.highlight && "bg-white text-[var(--color-ink)] ring-0 hover:bg-white/90",
                  )}
                >
                  {t.cta.label}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--color-muted)]">
          Klaro is not a bank. Mainnet payout fees, limits, and settlement times depend on the licensed partner in each corridor.
        </p>
      </section>

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          FAQ
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Common questions.
        </h2>
        <dl className="mt-10 max-w-2xl space-y-6">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-display text-base font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
