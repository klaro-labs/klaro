import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Pricing · Klaro",
  description:
    "Klaro is free on Arc testnet. Mainnet pricing is bps-based on settled invoices and cashouts — published before the first mainnet vendor onboards.",
};

const TIERS = [
  {
    name: "Testnet",
    price: "$0",
    period: "today",
    label: "testnet demo",
    description:
      "Explore the working demo flow with no fees and no real money movement.",
    items: [
      "Demo invoices, cashouts and receipt previews",
      "Simulated corridors and dispute tooling",
      "ERP and webhook surfaces shown as pending",
      "Simulated reputation and screening views",
      "API design surfaces under verification",
    ],
    cta: { label: "Start free", href: "/signin" as const },
  },
  {
    name: "Mainnet · Standard",
    price: "TBD",
    period: "per settled invoice",
    label: "mainnet-only",
    description:
      "Bps fee on settled invoices + fixed cashout spread. Published before first vendor onboards.",
    items: [
      "Same product surface as testnet",
      "Volume tiers + corridor-specific rates",
      "Dedicated LP capacity for committed flow",
      "SLA-backed status page integration",
      "Optional bring-your-own-LP for direct cashout",
    ],
    cta: { label: "Join waitlist", href: "/company" as const },
  },
  {
    name: "Mainnet · Platform",
    price: "Custom",
    period: "for marketplaces & ERPs",
    label: "partner-pending",
    description:
      "Embed Klaro in your product. White-label receipts, multi-vendor splits, custom corridors.",
    items: [
      "Multi-tenant API + RLS hooks",
      "Per-tenant fee splits via FeeSplitter",
      "Dedicated subdomain (i.your-domain.com)",
      "Co-branded receipt + checkout themes",
      "Quarterly business reviews",
    ],
    cta: { label: "Talk to us", href: "/company" as const },
  },
] as const;

const FAQ = [
  {
    q: "Why $0 on testnet?",
    a: "Testnet is for proving the product, the corridors, and the receipts. Charging would defeat that. Fees show up only when real money moves.",
  },
  {
    q: "What does the bps fee actually look like?",
    a: "We won't quote a final number until we've stress-tested with our first 10 mainnet vendors. The current internal model is 25–80bps on settled invoices, with corridor-specific cashout spreads on top. We'll publish the full schedule before the first mainnet onboard.",
  },
  {
    q: "Are there per-API-call fees?",
    a: "No. Pricing is per settled invoice and per executed cashout. API calls, webhooks, ERP syncs, and dashboard usage are all included.",
  },
  {
    q: "What about LPs?",
    a: "LPs earn a spread on each cashout they fulfill, minus a small Klaro routing fee. Onboarding is invite-only today; apply at /lp/apply.",
  },
] as const;

export default function PricingPage() {
  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-12">
        <SectionHeader
          eyebrow="Pricing"
          title={
            <>
              Free on testnet.
              <br />
              <span className="text-[var(--color-brand)]">
                Transparent on mainnet.
              </span>
            </>
          }
          lede="No usage meters, no surprise overages, no add-on SKUs. One fee on settled invoices, one spread on cashouts. Published in full before any vendor onboards mainnet."
        />
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 pb-20">
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="flex flex-col rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                <code className="font-mono text-[11px] font-medium text-[var(--color-brand)]">
                  {t.label}
                </code>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold tracking-tight">
                  {t.price}
                </span>
                <span className="text-sm text-[var(--color-ink-muted)]">
                  {t.period}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--color-ink)]/80">
                {t.description}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-[var(--color-ink)]/80">
                {t.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <span className="text-[var(--color-brand)]">·</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={t.cta.href}
                className="mt-8 inline-flex items-center justify-center rounded-full border border-[var(--color-ink)] bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader eyebrow="What's included" title="No à-la-carte SKUs." />
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {[
            ["Unlimited invoices", "No cap on invoice volume or count."],
            [
              "Unlimited receipts",
              "Demo receipts are previews; live minting requires verified deployment.",
            ],
            [
              "Unlimited webhooks",
              "Planned signed delivery for live integrations.",
            ],
            ["ERP sync", "Sandbox/adapter preview pending real connections."],
            [
              "Agent rails",
              "Contract-led agent flow under verification before activation.",
            ],
            [
              "Reputation",
              "Simulated score preview; on-chain recording is gated.",
            ],
            [
              "Status page",
              "Status surface preview; SLA and partner feeds are not launched.",
            ],
            [
              "WebAuthn + PWA",
              "Biometric sign-in, installable on mobile, offline-capable.",
            ],
          ].map(([label, body]) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5"
            >
              <h4 className="font-display text-base font-semibold">{label}</h4>
              <p className="mt-1 text-sm text-[var(--color-ink)]/80">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[800px] px-6 py-20">
        <SectionHeader eyebrow="FAQ" title="Direct answers." />
        <dl className="mt-10 divide-y divide-[var(--color-ink)]/10 border-y border-[var(--color-ink)]/10">
          {FAQ.map((f) => (
            <div
              key={f.q}
              className="grid gap-2 py-6 md:grid-cols-[1fr_2fr] md:gap-8"
            >
              <dt className="font-display text-base font-semibold">{f.q}</dt>
              <dd className="text-sm leading-relaxed text-[var(--color-ink)]/80">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Footer />
    </main>
  );
}
