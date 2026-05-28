import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";

export const metadata: Metadata = {
  title: "StableFX · Klaro",
  description:
    "Cross-chain stablecoin routing with Arc as the settlement hub. CCTP V2 burn-and-mint is live testnet. Local-rail-out is partner-pending.",
};

// Three legs of a StableFX flow today. Burn-and-mint via CCTP V2 is real.
// Arc settlement is real. Local-rail-out is partner-pending — labelled honestly.
const HOPS = [
  {
    step: "01",
    title: "Source chain in",
    desc:
      "Buyer pays USDC from whatever chain they hold it on — Arbitrum, Base, Polygon, Solana, OP. Klaro reads the corridor and locks the quote.",
    tag: "Live testnet",
    tone: "live" as const,
  },
  {
    step: "02",
    title: "Arc as settlement hub",
    desc:
      "CCTP V2 burns USDC on the source chain and mints native USDC on Arc. No wrapped tokens, no DEX, no IOU. One canonical balance.",
    tag: "Live testnet",
    tone: "live" as const,
  },
  {
    step: "03",
    title: "Local rail out",
    desc:
      "An invited LP picks up the cashout order and confirms local-rail receipt. The escrow releases USDC to the LP only after the vendor confirms fiat.",
    tag: "Partner-pending",
    tone: "pending" as const,
  },
];

const PROPS = [
  {
    title: "Sub-second finality on Arc",
    desc:
      "Arc's deterministic consensus settles in under a second. No 12-block waits, no probabilistic reorg windows. The buyer sees a confirmation before they put the phone down.",
  },
  {
    title: "Native USDC, not wrapped",
    desc:
      "CCTP V2 is Circle's first-party burn-and-mint protocol. Every dollar on Arc is the same Circle USDC the buyer started with — no bridge custody, no wrapped-token de-peg risk.",
  },
  {
    title: "Adapter-routed swaps",
    desc:
      "StableFXAdapterRegistry routes each (srcToken, dstToken) pair to its registered adapter. Operator swaps adapters atomically; vendors see no observable middle state.",
  },
  {
    title: "Quote-frozen pricing",
    desc:
      "The quote your customer sees is the quote that settles. The InvoiceEscrow locks the rate at acceptance; CCTP V2 fees and Arc finality remove the FX-drift window other rails leave open.",
  },
];

const HONESTY = [
  {
    label: "Live testnet",
    desc: "CCTP V2 routing into Arc, InvoiceEscrow quote-lock, AuditReceipt anchoring, StableFXAdapterRegistry contract.",
  },
  {
    label: "Access-gated",
    desc: "USDC ↔ EURC via Circle StableFX — wired through MockStableFXAdapter today; CircleStableFXAdapter takes over the pair on TEST access grant.",
  },
  {
    label: "Partner-pending",
    desc:
      "Every local-currency rail (INR, BRL, MXN, NGN, KES, PHP, ZAR, JPY, KRW). Adapters and state machines ship; no real fiat moves until an LP partner is signed.",
  },
  {
    label: "Mainnet-only",
    desc: "Real fiat settlement across any corridor. Mainnet target lands when partner agreements + KYB-grade LP onboarding are in place.",
  },
];

const TONE_STYLES: Record<"live" | "pending", string> = {
  live:
    "bg-[color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[var(--color-success)]",
  pending: "bg-[var(--color-klaro-gold-soft)] text-[var(--color-klaro-gold-deep)]",
};

export default function ProductStableFXPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="StableFX"
        chips={["CCTP V2 · live testnet", "Local rails · partner-pending"]}
        title="Cross-chain stablecoin routing."
        sub="Klaro takes USDC in from any major chain, settles it on Arc with sub-second finality, and hands it to a verified liquidity partner for local payout. CCTP V2 handles the cross-chain hop; partners handle the last mile."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "See cashout", href: "/product/cashout", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          How it works
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Three hops. One settlement.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {HOPS.map((h) => (
            <div
              key={h.title}
              className="flex flex-col rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  {h.step}
                </span>
                <span
                  className={`inline-flex rounded-pill px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${TONE_STYLES[h.tone]}`}
                >
                  {h.tag}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
                {h.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {h.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          What it gives you
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Properties Arc + Circle make easy to claim — and easy to prove.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {PROPS.map((p) => (
            <FeatureCard key={p.title} title={p.title}>
              {p.desc}
            </FeatureCard>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6 md:p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Honesty ledger
          </p>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">
            What is live, what is gated, what is pending.
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            StableFX ships as a registry of adapters. Some adapters call real
            Circle infrastructure today. Others are mock implementations behind
            the same interface — clearly labelled so the demo flow works
            end-to-end without claiming real settlement.
          </p>
          <dl className="mt-6 space-y-4">
            {HONESTY.map((h) => (
              <div
                key={h.label}
                className="grid gap-2 border-t border-[var(--color-line)] pt-4 md:grid-cols-[160px_1fr] md:gap-6"
              >
                <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-2)]">
                  {h.label}
                </dt>
                <dd className="text-sm leading-relaxed text-[var(--color-muted)]">
                  {h.desc}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="klaro-container pb-20">
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Contracts on Arc testnet
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4">
              <span className="font-mono text-[12px] text-[var(--color-ink-2)]">
                StableFXAdapterRegistry
              </span>
              <span className="font-mono text-[12px] text-[var(--color-muted)]">
                packages/contracts/src/StableFXAdapterRegistry.sol
              </span>
            </li>
            <li className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4">
              <span className="font-mono text-[12px] text-[var(--color-ink-2)]">
                IStableFXAdapter
              </span>
              <span className="font-mono text-[12px] text-[var(--color-muted)]">
                packages/contracts/src/adapters/IStableFXAdapter.sol
              </span>
            </li>
            <li className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4">
              <span className="font-mono text-[12px] text-[var(--color-ink-2)]">
                MockStableFXAdapter
              </span>
              <span className="font-mono text-[12px] text-[var(--color-muted)]">
                packages/contracts/src/adapters/MockStableFXAdapter.sol
              </span>
            </li>
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
            Deployed addresses land in{" "}
            <span className="font-mono">apps/web/lib/env.ts</span> after each
            testnet cut. Until then the registry runs through{" "}
            <span className="font-mono">MockStableFXAdapter</span> per the
            registry comments — labelled <span className="font-mono">simulated</span>{" "}
            in every consumer surface.
          </p>
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
