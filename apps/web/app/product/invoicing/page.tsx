import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Invoicing · Klaro",
  description: "Issue hosted USDC invoices with multi-chain receive, quote freeze, and ERP-ready receipts.",
};

const FEATURES = [
  { title: "Multi-chain receive", desc: "Customer picks the chain they hold USDC on. CCTP V2 sweeps it home to Arc in seconds." },
  { title: "Quote freeze", desc: "Lock the exchange rate for 15 minutes so the vendor knows exactly what they receive." },
  { title: "Partial + over-payment", desc: "Accept partial payments with automatic tracking. Over-payments trigger a refund flow." },
  { title: "Refund flow", desc: "One-click refund routes USDC back to the buyer's wallet with a signed proof." },
  { title: "Branded templates", desc: "Vendor logo, colours, and custom message on every hosted invoice page." },
  { title: "Recurring billing", desc: "Set a schedule. Klaro generates and sends invoices automatically each cycle." },
];

export default function ProductInvoicingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Invoicing"
        chips={["Live testnet", "USDC native", "Quote freeze"]}
        title="Invoice anyone. Get paid in seconds."
        sub="Issue a hosted invoice link. Your customer pays from any chain. USDC settles on Arc with sub-second finality."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Read API docs", href: "/docs", variant: "secondary" },
        ]}
      />
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Built for serious vendors
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Everything an invoice needs to settle cleanly.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
