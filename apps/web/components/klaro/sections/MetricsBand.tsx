import { LANDING_METRICS } from "@/lib/testnetMetrics";

/**
 * §14 Metrics band — 4 testnet stats, with an honest footer note.
 * Data source: `lib/testnetMetrics.ts` (single seam for live data in M11).
 */
export function MetricsBand() {
  return (
    <section className="bg-[var(--color-bg)] border-y border-[var(--color-line)]">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(40px,5vw,72px)]">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Testnet product preview · illustrative metrics
        </p>
        <dl className="mt-8 grid gap-y-10 gap-x-6 md:grid-cols-4">
          {LANDING_METRICS.map((m) => (
            <div key={m.label}>
              <dt className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
                {m.value}
              </dt>
              <dd className="mt-2 text-sm leading-snug text-[var(--color-ink-muted)]">
                {m.label}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 max-w-2xl mx-auto text-center text-xs text-[var(--color-ink-subtle)]">
          Demonstration counters only — not live transaction volume. Verified
          Arc testnet aggregates ship once the telemetry pipeline lands.
        </p>
      </div>
    </section>
  );
}
