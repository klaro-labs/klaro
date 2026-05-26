import { Fragment } from "react";
import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";

/**
 * §4 How it works — Three steps. One receipt.
 * Three numbered cards with realistic timing pills.
 */

const STEPS = [
  {
    n: "01",
    eta: "≈ 30s",
    title: "Vendor creates an invoice.",
    body: "Pick currency, line items, due date. Klaro generates a hosted page at i.klaro.so/<id>.",
  },
  {
    n: "02",
    eta: "≈ 8s",
    title: "Customer pays in USDC.",
    body: "The demo previews USDC payment. Live routing and screening remain gated until deployed and configured.",
  },
  {
    n: "03",
    eta: "≈ 1.4s",
    title: "Receipt preview appears.",
    body: "Live-contract mode can anchor proof after verification. This demo is clearly marked simulated.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 py-28 md:-mt-[22px] md:py-40">
      <SectionHeader eyebrow="How it works" title="Three steps. One receipt." />
      <ol className="mt-16 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {STEPS.map((s, i) => (
          <Fragment key={s.n}>
            <li className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[var(--color-brand)]">
                  {s.n}
                </span>
                <Badge tone="neutral">{s.eta}</Badge>
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {s.body}
              </p>
            </li>
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="hidden text-center text-2xl text-[var(--color-ink-subtle)] md:inline-flex md:items-center md:justify-center"
              >
                →
              </span>
            ) : null}
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
