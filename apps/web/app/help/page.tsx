import Link from "next/link";
import type { Metadata, Route } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";

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
      "Pilot live for INR. Other corridors simulated until partner sign.",
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
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Help center
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            How can we help?
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            Full-text search via Algolia DocSearch lands soon (docs.klaro.so
            cuts over to Mintlify). For now: jump to the topic that matches your
            question, or email{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:help@klaro.so"
            >
              help@klaro.so
            </a>{" "}
            — 4-hour response during business hours.
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm">
            <span className="sr-only">Search help</span>
            <input
              type="search"
              placeholder="Search Klaro help"
              aria-label="Search help — full-text search arrives later"
              disabled
              className="w-full rounded-lg border border-[var(--color-line)] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
            />
          </label>
        </div>

        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TOPICS.map((t) => (
            <li key={t.title}>
              <Link
                href={t.href}
                className="block rounded-lg border border-[var(--color-line)] bg-white p-5 hover:border-[var(--color-brand)]"
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
      <Footer />
    </main>
  );
}
