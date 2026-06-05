import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { MockBrowserChrome } from "@/components/ui/MockBrowserChrome";
import { MockReceipt } from "@/components/ui/demos/MockReceipt";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "Receipts · Klaro",
  description: "On-chain proof of every payment. Both parties sign. Verifiable by anyone without trusting Klaro.",
};

const PILLARS = [
  { title: "Both sides, signed", desc: "The vendor issued the invoice. The buyer signed an EIP-712 acceptance. The receipt anchors both signatures — not just the wire." },
  { title: "Cryptographically anchored", desc: "The receipt hash is committed to the AuditReceipt contract on Arc. Amount, payer, vendor, and tx hash are immutable once settled." },
  { title: "Private by default", desc: "Customer names, invoice line items, and PII never go on-chain. Vendors choose what to reveal on the public receipt." },
];

export default function ProductReceiptsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Receipts"
        chips={["Live testnet", "On-chain", "Verifiable"]}
        title="Proof that survives your inbox."
        sub="Every Klaro payment mints a public on-chain receipt. Both parties sign. Anyone can verify without trusting Klaro, the vendor, or the buyer."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "How verification works", href: "/trust", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <div className="mx-auto max-w-[560px]">
          <MockBrowserChrome url="www.myklaro.app/receipt/demo">
            <MockReceipt />
          </MockBrowserChrome>
        </div>
      </section>

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Why it matters
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Receipts that prove themselves.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <FeatureCard key={p.title} title={p.title}>
              {p.desc}
            </FeatureCard>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Verify any receipt
          </p>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">
            Three lines. No Klaro account required.
          </h3>
          <pre className="mt-5 overflow-x-auto rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-4 font-mono text-[12px] leading-relaxed text-[var(--color-ink-2)]">
{`# Read the receipt straight off Arc
curl https://www.myklaro.app/api/v1/receipts/<hash> \\
  | jq '{amount, payer, vendor, txHash, blockNumber, signatures}'`}
          </pre>
          <p className="mt-3 text-[12px] text-[var(--color-muted)]">
            Or recompute the receipt hash locally — the schema is in <span className="font-mono">packages/contracts/src/AuditReceipt.sol</span>.
          </p>
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
