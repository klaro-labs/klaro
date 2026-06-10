import Link from "next/link";
import type { Metadata, Route } from "next";
import { Search } from "lucide-react";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Help · Klaro",
  description:
    "Common Klaro tasks: invoice in USDC, cash out locally, share a verifiable receipt, dispute a payment.",
};

const TOPICS: { title: string; description: string; href: Route }[] = [
  {
    title: "Get paid in USDC",
    description: "Create your first invoice in 90 seconds.",
    href: "/vendor/invoices/new" as Route,
  },
  {
    title: "Cashout to local currency",
    description:
      "INR runs as a testnet pilot (no real money moves yet). Other corridors are simulated until partner sign-off.",
    href: "/vendor/cashout" as Route,
  },
  {
    title: "Disputes",
    description: "Open a case, defend a case, understand 5 decision routes.",
    href: "/legal/terms" as Route,
  },
  {
    title: "Reputation",
    description: "How the on-chain Trust Score works + 7 fields breakdown.",
    href: "/vendor/reputation" as Route,
  },
  {
    title: "Webhooks + API",
    description: "Signed POSTs, HMAC verification, retry behavior.",
    href: "/vendor/integrations/webhooks" as Route,
  },
  {
    title: "Agent jobs",
    description: "ERC-8183 6-state lifecycle for hiring autonomous agents.",
    href: "/agents" as Route,
  },
  {
    title: "x402 nanopayments",
    description: "Per-API-call billing with zero-gas EIP-3009 sigs.",
    href: "/x402-demo" as Route,
  },
  {
    title: "FX swaps",
    description: "USDC ↔ EURC ↔ USYC on Arc via StableFX + App Kit Swap.",
    href: "/fx" as Route,
  },
  {
    title: "Privacy + data export",
    description: "GDPR export, account delete, consent toggles.",
    href: "/account/privacy" as Route,
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <section className="klaro-container w-full py-10">
        <header className="mb-8 max-w-3xl">
          <Eyebrow>Help center</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight">
            How can we help?
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
            Pick the topic that matches your question, or email{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:prateek@myklaro.app"
            >
              prateek@myklaro.app
            </a>{" "}
            — 4-hour response during business hours.
          </p>
        </header>

        <div
          className="mb-6 flex items-center gap-2.5 rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 py-3 text-sm text-[var(--color-ink-muted)]"
          role="note"
          aria-label="Help navigation"
        >
          <Search aria-hidden className="size-4 shrink-0 text-[var(--color-ink-subtle)]" />
          <span>Search by topic below, or contact support for anything not listed.</span>
        </div>

        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TOPICS.map((t) => (
            <li key={t.title}>
              <Link
                href={t.href}
                className="block rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5 hover:border-[var(--color-brand)]"
              >
                <div className="font-display text-lg font-semibold">
                  {t.title}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {t.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <FinalCta />
      <Footer />
    </main>
  );
}
