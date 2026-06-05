import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { CORRIDORS, type CorridorStatus } from "@/lib/corridors";

export const metadata: Metadata = {
  title: "Cashout · Klaro",
  description: "Turn USDC into local currency through verified liquidity partners. Escrow-protected, dispute-ready.",
};

const STEPS = [
  { title: "Submit request", desc: "Vendor picks an amount and corridor. Klaro locks USDC in escrow on Arc." },
  { title: "LP picks up", desc: "A verified liquidity partner claims the order and submits local-rail proof." },
  { title: "Confirm + release", desc: "Vendor confirms receipt of local currency. Escrow releases USDC to the LP." },
];

const STATUS_COPY: Record<CorridorStatus, { label: string; tone: string }> = {
  live: {
    // QA-075: US/USD is USDC-native (USDC == USD, no fiat conversion;
    // realFiatMoves:false). A bare "Live" chip on a cashout table read as a
    // production fiat payout — label it for what it is.
    label: "USDC-native",
    tone: "bg-[color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[#166534]",
  },
  pilot: {
    label: "Pilot",
    tone: "bg-[var(--color-klaro-orange-soft)] text-[var(--color-klaro-orange-deep)]",
  },
  "access-gated": {
    label: "Access-gated",
    tone: "bg-[var(--color-klaro-gold-soft)] text-[var(--color-klaro-gold-deep)]",
  },
  simulation: {
    label: "Simulated",
    tone: "bg-[var(--color-bg-warm)] text-[var(--color-muted)] border border-[var(--color-line)]",
  },
};

export default function ProductCashoutPage() {
  const sorted = [...CORRIDORS].sort((a, b) => {
    const order: Record<CorridorStatus, number> = { live: 0, pilot: 1, "access-gated": 2, simulation: 3 };
    return order[a.status] - order[b.status];
  });
  const liveCount = CORRIDORS.filter((c) => c.status === "live").length;
  const pilotCount = CORRIDORS.filter((c) => c.status === "pilot").length;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Cashout"
        chips={["Testnet pilot", "LP marketplace · invite-only"]}
        title="USDC in. Local currency out."
        sub="Vendors cash USDC into rupees, reais, or euros through verified liquidity partners — every step escrowed, provable, and dispute-ready. On testnet today the INR corridor is a pilot and the rest are simulated; no real money moves."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Become an LP", href: "/lp", variant: "secondary" },
        ]}
      />

      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          How cashout works
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Three steps. Every one provable.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <FeatureCard key={s.title} title={`${String(i + 1).padStart(2, "0")} · ${s.title}`}>
              {s.desc}
            </FeatureCard>
          ))}
        </div>
      </section>

      <section className="klaro-container pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
              Corridors
            </p>
            <h2 className="mt-3 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-tight">
              {liveCount} USDC-native · {pilotCount} pilot · {CORRIDORS.length - liveCount - pilotCount} simulated
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
              Honest labels per <a href="/trust" className="text-[var(--color-klaro-orange)] underline">principle 8</a>.
              Simulated corridors ship the full state machine but no real fiat moves until a partner signs.
            </p>
          </div>
          <a
            href="mailto:prateek@myklaro.app"
            className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)] hover:underline"
          >
            Apply as an LP →
          </a>
        </div>

        <div className="mt-8 overflow-hidden rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)]">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[var(--color-line)] bg-[var(--color-bg-warm)] px-5 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)] md:grid">
            <span>Corridor</span>
            <span>Currency</span>
            <span>Partner</span>
            <span>ETA</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-[var(--color-line)]">
            {sorted.map((c) => {
              const status = STATUS_COPY[c.status];
              const eta = c.etaMinutes === 0 ? "Instant" : `~${c.etaMinutes} min`;
              return (
                <li key={c.code} className="px-5 py-4 text-[13px]">
                  {/* Mobile: stacked card. Desktop: 5-col grid. */}
                  <div className="flex items-start justify-between gap-3 md:hidden">
                    <span className="font-medium">{c.country}</span>
                    <span
                      className={`inline-flex shrink-0 rounded-pill px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] text-[var(--color-muted)] md:hidden">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.1em] opacity-70">
                        Pair
                      </dt>
                      <dd className="mt-0.5 text-[var(--color-ink-2)]">
                        {c.symbol} {c.currency}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.1em] opacity-70">
                        Partner
                      </dt>
                      <dd className="mt-0.5 truncate">{c.partner}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.1em] opacity-70">
                        ETA
                      </dt>
                      <dd className="mt-0.5">{eta}</dd>
                    </div>
                  </dl>
                  <div className="hidden md:grid md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] md:items-center md:gap-4">
                    <span className="font-medium">{c.country}</span>
                    <span className="font-mono text-[12px] text-[var(--color-ink-2)]">
                      {c.symbol} {c.currency}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--color-muted)]">
                      {c.partner}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--color-muted)]">
                      {eta}
                    </span>
                    <span className="text-right">
                      <span
                        className={`inline-flex rounded-pill px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${status.tone}`}
                      >
                        {status.label}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
