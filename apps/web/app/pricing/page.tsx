import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Pill } from "@/components/ui/Pill";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { TIERS, COMPARE_ROWS, FAQ } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing · Klaro",
  description:
    "Free on testnet. 1% on mainnet. No monthly fee, no setup fee, no per-seat fee, no hidden FX markup.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Pricing"
        chips={["Testnet free forever"]}
        title="Pay what you actually pay."
        sub="No monthly fee. No setup fee. No per-seat fee. No undisclosed FX markup. During testnet every feature is free."
        ctas={[
          { label: "Open workspace", href: "/signin" },
          { label: "Talk to sales", href: "mailto:sales@klaro.so", variant: "secondary" },
        ]}
      />

      {/* 3-tier cards */}
      <section className="klaro-container pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <article
              key={t.id}
              className={cn(
                "relative flex flex-col rounded-[var(--klaro-tile-radius)] p-[var(--klaro-tile-pad)]",
                t.highlight
                  ? "bg-[var(--color-ink)] text-white shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
                  : "border border-[var(--color-line)] bg-[var(--color-bg-elevated)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">{t.name}</h3>
                {t.status === "live testnet" && (
                  <Pill tone="warm" size="sm" dot="warm">
                    live testnet
                  </Pill>
                )}
                {t.status === "mainnet-future" && (
                  <Pill tone="gold" size="sm">
                    Mainnet target
                  </Pill>
                )}
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <p className="font-display text-5xl font-semibold tracking-tight">
                  {t.price}
                </p>
                <span
                  className={cn(
                    "text-sm",
                    t.highlight ? "text-white/60" : "text-[var(--color-muted)]",
                  )}
                >
                  {t.unit}
                </span>
              </div>
              <p
                className={cn(
                  "mt-3 text-sm",
                  t.highlight ? "text-white/70" : "text-[var(--color-muted)]",
                )}
              >
                {t.sub}
              </p>
              <ul className="mt-7 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className={cn(
                      "flex items-start gap-2",
                      t.highlight ? "text-white/85" : "text-[var(--color-muted)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={
                        t.highlight
                          ? "text-[var(--color-klaro-gold)]"
                          : "text-[var(--color-klaro-orange)]"
                      }
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href={t.cta.href as Route}
                  className={cn(
                    buttonVariants({ size: "md", variant: "secondary" }),
                    "w-full",
                    t.highlight && "bg-white text-[var(--color-ink)] ring-0 hover:bg-white/90",
                  )}
                >
                  {t.cta.label}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--color-muted)]">
          Klaro is not a bank. Mainnet payout fees, limits, and settlement times depend on the licensed partner in each corridor.
        </p>
      </section>

      {/* Comparison table — horizontally scrollable on mobile with sticky first column. */}
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Compare tiers
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Every line, every tier.
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-[var(--color-muted)]">
          Same product across tiers. The differences are operational &mdash; limits, support response, retention, and audit posture.
        </p>

        <div className="mt-10 overflow-x-auto rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-bg-warm)] text-left">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-[var(--color-bg-warm)] px-5 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]"
                >
                  Feature
                </th>
                {TIERS.map((t) => (
                  <th
                    key={t.id}
                    scope="col"
                    className="px-5 py-4 text-left font-display text-sm font-semibold"
                  >
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => {
                const zebra = i % 2 === 1;
                return (
                  <tr
                    key={row.feature}
                    className={cn(
                      "border-b border-[var(--color-line)] last:border-b-0",
                      zebra && "bg-[var(--color-bg)]",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 px-5 py-3.5 text-left font-medium text-[var(--color-ink)]",
                        zebra
                          ? "bg-[var(--color-bg)]"
                          : "bg-[var(--color-bg-elevated)]",
                      )}
                    >
                      {row.feature}
                    </th>
                    <td className="px-5 py-3.5 text-[var(--color-muted)]">{row.testnet}</td>
                    <td className="px-5 py-3.5 text-[var(--color-muted)]">{row.standard}</td>
                    <td className="px-5 py-3.5 text-[var(--color-muted)]">{row.scale}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-[var(--color-muted)] md:hidden">
          Scroll horizontally to see all tiers.
        </p>
      </section>

      {/* FAQ accordion */}
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          FAQ
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Common questions.
        </h2>
        <div className="mt-10 max-w-3xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-6 font-display text-base font-semibold">
                {item.q}
                <span
                  aria-hidden
                  className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] text-xs text-[var(--color-muted)] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}
