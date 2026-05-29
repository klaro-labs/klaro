import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Company · Klaro",
  description:
    "Klaro is the Arc-native invoice and receipt rail for emerging-market vendors. We work in public, ship every week, and label every claim.",
};

const PRINCIPLES = [
  {
    title: "Money flows are state machines.",
    body: "Every invoice, payment, cashout, and dispute has explicit states, retries, failures, and final outcomes. No undefined branches. No infinite loops.",
  },
  {
    title: "No PII onchain.",
    body: "Hashes, IDs, wallet addresses only. Raw evidence stays encrypted offchain. Privacy is a feature, not an afterthought.",
  },
  {
    title: "Proof beats claims.",
    body: "Every live action produces evidence: tx hash, signature, receipt, payout reference, audit-log entry. Simulated states remain explicitly labelled.",
  },
  {
    title: "Admin is not the product.",
    body: "Normal flows are automatic. Admin only handles risk, disputes, stuck states. If admin is needed for normal operation, the product is broken.",
  },
  {
    title: "Test like money is real.",
    body: "Foundry on contracts, Vitest on the API, Playwright on the UI. Coverage is reported honestly — no green-badge theatre.",
  },
  {
    title: "Honest labels everywhere.",
    body: "live testnet · simulated · access-gated · partner-pending · mainnet-only · unsupported. Every feature carries one tag. No overclaiming.",
  },
] as const;

export default function CompanyPage() {
  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />

      <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-16">
        <SectionHeader
          eyebrow="Klaro"
          title={
            <>
              Make stablecoin payments
              <br />
              <span className="text-[var(--color-brand)]">boring.</span>
            </>
          }
          lede="The vendors we build for don't care about chains, oracles, or rollups. They care whether the money arrived. Klaro hides every piece of plumbing that doesn't matter and surfaces every piece that does."
        />
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-[var(--color-ink)]/10 bg-white p-8 md:p-10">
            <p className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-brand)]">
              Mission
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight">
              Make every payment a vendor receives feel like they were paid by
              their best customer.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--color-ink)]/75">
              Fast. Verifiable. With a receipt that survives any audit. In the
              local currency they spend. Without ever asking them to learn what a
              chain ID is.
            </p>
          </div>
          <div className="rounded-3xl border border-[var(--color-ink)]/10 bg-white p-8 md:p-10">
            <p className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-brand)]">
              North star
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight">
              One billion vendors paid faithfully.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--color-ink)]/75">
              The first emerging-market vendor invoicing graph on stablecoin
              rails — owned by the vendors, readable by every lender, denominated
              in USDC.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader
          eyebrow="How we work"
          title="Six rules that govern every decision."
          lede="The full set of 21 product principles and 15 AI-discipline rules lives in our repo. Here are the six that shape the product most directly."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6"
            >
              <h3 className="font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]/80">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader eyebrow="Stack" title="Built on Arc + Circle." />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {[
            [
              "Arc Layer-1",
              "USDC-native gas · sub-second finality · opt-in privacy · EVM-compat.",
            ],
            [
              "Circle CCTP V2",
              "Planned cross-chain USDC route for live buyer payments.",
            ],
            [
              "Circle App Kit",
              "Planned unified balance, bridge, and swap integration.",
            ],
            [
              "Circle Wallets",
              "Target wallet integration with passkeys and non-custodial controls.",
            ],
            [
              "ERC-8004 / 8183",
              "Agent identity + job-settlement escrow. The agent-economy spec.",
            ],
            [
              "Pyth + Permit2",
              "Target FX oracle and approval primitives for live cashout.",
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5"
            >
              <h4 className="font-display text-base font-semibold">{k}</h4>
              <p className="mt-2 text-sm text-[var(--color-ink)]/80">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-16">
        <div className="rounded-3xl border border-[var(--color-ink)]/10 bg-white p-8 md:p-10">
          <p className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Who we are
          </p>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            A small team, working in public.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--color-ink)]/75">
            Klaro is pre-incorporation. Real bios and office details will
            appear here once the legal entity is formed — until then we
            won&rsquo;t invent them.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader eyebrow="Get in touch" title="Three doors in." />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <Link
            href="/signin"
            className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6 transition-colors hover:border-[var(--color-brand)]/40"
          >
            <h4 className="font-display text-lg font-semibold">Try the product</h4>
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              Open the testnet demo. No credit card and no real funds moved.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--color-brand)]">
              /signin →
            </span>
          </Link>
          <Link
            href="/build"
            className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6 transition-colors hover:border-[var(--color-brand)]/40"
          >
            <h4 className="font-display text-lg font-semibold">Build on us</h4>
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              OpenAPI 3.1 · @klaro/sdk · webhook receivers · ERC-8183 reference.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--color-brand)]">
              /build →
            </span>
          </Link>
          <Link
            href="/company/contact"
            className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6 transition-colors hover:border-[var(--color-brand)]/40"
          >
            <h4 className="font-display text-lg font-semibold">Partnerships</h4>
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              ERP integrations, LP onboarding, corridor expansion, investors.
            </p>
            <span className="mt-4 inline-block text-xs text-[var(--color-brand)]">
              /company/contact →
            </span>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
