import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Product · Klaro",
  description:
    "Klaro is the Arc-native payment OS: invoicing, screening, partner cashout, proof receipts, retainer streams, and an agent-economy primitive — one stack.",
};

const SURFACES = [
  {
    domain: "app.klaro.so",
    audience: "Vendor",
    purpose:
      "Invoicing, balance, cashout, ERP sync, retainer streams, reputation.",
    href: "/vendor" as const,
  },
  {
    domain: "i.klaro.so",
    audience: "Buyer (checkout)",
    purpose:
      "Hosted invoice demo. Preview USDC checkout and a clearly labelled simulated receipt.",
    href: "/i/demo-invoice" as const,
  },
  {
    domain: "receipt.klaro.so",
    audience: "Public",
    purpose:
      "Stenn-Proof receipt preview: who paid whom and when. Chain anchoring is live-mode only.",
    href: "/receipt/0xdemo" as const,
  },
  {
    domain: "cashout.klaro.so",
    audience: "Vendor",
    purpose:
      "Simulate USDC → local rails (INR, BRL, PHP, MXN…) with proof and dispute UI.",
    href: "/vendor/cashout" as const,
  },
  {
    domain: "lp.klaro.so",
    audience: "Liquidity partner",
    purpose:
      "Invite-only workflow preview. Stake, proof and release require verified live integration.",
    href: "/lp" as const,
  },
  {
    domain: "fx.klaro.so",
    audience: "Treasury",
    purpose:
      "Klaro Lab. Stable-to-stable FX corridor previews with partner-pending labels.",
    href: "/fx" as const,
  },
  {
    domain: "admin.klaro.so",
    audience: "Operator",
    purpose:
      "Dispute queue, risk holds, sanctions cache, manual review. Never required for normal flows.",
    href: "/admin" as const,
  },
  {
    domain: "status.klaro.so",
    audience: "Everyone",
    purpose:
      "Public status surface for planned service health and integration reporting.",
    href: "/status" as const,
  },
] as const;

const PRIMITIVES = [
  {
    name: "InvoiceEscrow",
    short: "Hold + release",
    detail:
      "Designed for EIP-712 vendor acceptance, on-chain settlement, refund routing and split payouts.",
  },
  {
    name: "CashoutOrderProcessor",
    short: "USDC → fiat rails",
    detail:
      "REQUESTED → LOCKED → CLAIMED → PROOF_SUBMITTED → CONFIRMED/RELEASED with dispute path.",
  },
  {
    name: "AuditReceipt",
    short: "Stenn-Proof",
    detail:
      "Designed for ERC-721 anchoring of invoiceHash, screeningHash and settlement tx.",
  },
  {
    name: "DisputeManager",
    short: "Two-party adjudication",
    detail:
      "Open → Evidence → Decide. Enforcement now reads the recorded outcome before fund routing.",
  },
  {
    name: "VendorReputation",
    short: "Verifiable score",
    detail:
      "Designed for scores derived from escrow, cashout and dispute outcomes. Demo UI is simulated.",
  },
  {
    name: "AgentEscrow + AgentRegistry",
    short: "ERC-8004 / 8183",
    detail:
      "Agent identity, signed jobs, escrow → deliverable → release. Fee cap 50%. ACP hook surface.",
  },
] as const;

export default function ProductPage() {
  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-20">
        <SectionHeader
          eyebrow="Product"
          title={
            <>
              One payment stack.
              <br />
              <span className="text-[var(--color-brand)]">Every surface.</span>
            </>
          }
          lede="Klaro demonstrates a USDC invoice, receipt and cashout-dispute workflow for Arc testnet. Current payment and payout surfaces are clearly simulated until live screening, partners and deployment are enabled."
        />

        <div className="mt-16 grid gap-4 md:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.domain}
              href={s.href}
              className="group rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6 transition-colors hover:border-[var(--color-brand)]/40"
            >
              <div className="flex items-baseline justify-between">
                <code className="font-mono text-sm font-medium text-[var(--color-brand)]">
                  {s.domain}
                </code>
                <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-ink-muted)]">
                  {s.audience}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]/80">
                {s.purpose}
              </p>
              <span className="mt-4 inline-block text-xs text-[var(--color-brand)] transition-opacity group-hover:opacity-80">
                Open surface →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader
          eyebrow="Primitives"
          title="Built around six contracts. Verification in progress."
          lede="The architecture uses a focused set of money-moving contracts with explicit state transitions. Contract tests and independent security review remain required before any live-funds launch."
        />
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {PRIMITIVES.map((p) => (
            <div
              key={p.name}
              className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-ink-muted)]">
                  {p.short}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]/80">
                {p.detail}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-[var(--color-ink-muted)]">
          ABIs are pinned at{" "}
          <code className="font-mono">packages/contracts/abis/v1.0/</code> and
          regenerated from <code className="font-mono">forge build</code>. The
          web app never hand-rolls a signature.
        </p>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 py-20">
        <SectionHeader
          eyebrow="Honesty"
          title="Every surface is labeled."
          lede="Per principle 8: nothing overclaims. Each feature carries one of these tags in code, UI, logs, docs, and marketing — so you always know what you're looking at."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {[
            [
              "live testnet",
              "Enabled only where a verified Arc testnet integration is active.",
            ],
            ["simulated", "Demo data; live wiring queued for a later month."],
            ["access-gated", "Real but invite-only (e.g. LP onboarding)."],
            [
              "partner-pending",
              "Depends on a third-party (Circle, Sumsub, etc.) credential.",
            ],
            [
              "mainnet-only",
              "Will ship when mainnet exists; testnet has a stub.",
            ],
            ["unsupported", "Not built. Documented so you know we know."],
          ].map(([label, body]) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5"
            >
              <code className="font-mono text-xs font-medium text-[var(--color-brand)]">
                {label}
              </code>
              <p className="mt-2 text-sm text-[var(--color-ink)]/80">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
