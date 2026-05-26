import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Docs · Klaro",
  description:
    "Klaro documentation. Quickstarts, API reference, contract reference, webhook events, ERC-8183 spec.",
};

const SECTIONS = [
  {
    title: "Get started",
    items: [
      {
        label: "5-minute quickstart",
        href: "/developers",
        body: "Install @klaro/sdk, create your first invoice, verify a receipt.",
      },
      {
        label: "Authentication",
        href: "/developers",
        body: "API keys, WebAuthn, signed cookies. RLS gates every read.",
      },
      {
        label: "Environments",
        href: "/developers",
        body: "arc-testnet today; arc-mainnet when published. No staging tier.",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        label: "OpenAPI 3.1 spec",
        href: "/api/openapi",
        body: "Every REST endpoint, every webhook payload, machine-readable.",
      },
      {
        label: "Contract ABIs",
        href: "https://github.com/klaro-labs/arcbuild",
        body: "packages/contracts/abis/v1.0/*.json — pinned per release.",
      },
      {
        label: "ERC-8183 escrow",
        href: "https://github.com/klaro-labs/arcbuild",
        body: "AgentEscrow.sol is the canonical implementation.",
      },
      {
        label: "ReasonCodes",
        href: "https://github.com/klaro-labs/arcbuild",
        body: "Every admin action carries one of the canonical reason hashes.",
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        label: "Building a checkout",
        href: "/developers",
        body: "Host your own checkout that creates Klaro invoices behind the scenes.",
      },
      {
        label: "ERP sync",
        href: "/developers",
        body: "Tally / QuickBooks / Xero / Zoho — bi-directional, idempotency-keyed.",
      },
      {
        label: "Webhook receivers",
        href: "/developers",
        body: "Verify HMAC, replay-protect, ack idempotently.",
      },
      {
        label: "Agent integration",
        href: "/developers",
        body: "Register an ERC-8004 agent; receive ERC-8183 jobs.",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Status & SLA",
        href: "/status",
        body: "Public health, per-contract pause state, partner outages.",
      },
      {
        label: "Runbooks",
        href: "https://github.com/klaro-labs/arcbuild",
        body: "9 operator playbooks: pause, slash, refund, KYB-revoke, …",
      },
      {
        label: "Bug bounty",
        href: "/trust",
        body: "Immunefi. Scope: every contract in src/. Up to $50k testnet.",
      },
    ],
  },
] as const;

export default function DocsLandingPage() {
  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-12">
        <SectionHeader
          eyebrow="Docs"
          title={
            <>
              Everything you need.
              <br />
              <span className="text-[var(--color-brand)]">
                Nothing you don&apos;t.
              </span>
            </>
          }
          lede="Klaro docs are written for engineers who already know the domain. No 101 explanations, no marketing fluff in the middle of an API reference. If you want background, see /company. If you want to ship, start below."
        />
      </section>

      {SECTIONS.map((s) => (
        <section
          key={s.title}
          className="mx-auto w-full max-w-[1200px] px-6 py-12"
        >
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight">
            {s.title}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {s.items.map((it) => {
              const ext = it.href.startsWith("http");
              const cls =
                "block rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5 transition-colors hover:border-[var(--color-brand)]/40";
              const content = (
                <>
                  <h3 className="font-display text-base font-semibold">
                    {it.label}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-ink)]/80">
                    {it.body}
                  </p>
                  <span className="mt-3 inline-block text-xs text-[var(--color-brand)]">
                    Open →
                  </span>
                </>
              );
              return ext ? (
                <a
                  key={it.label}
                  href={it.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cls}
                >
                  {content}
                </a>
              ) : (
                <Link key={it.label} href={it.href as never} className={cls}>
                  {content}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <Footer />
    </main>
  );
}
