import { Fragment } from "react";
import { SectionHeader } from "../SectionHeader";
import { Pill } from "@/components/ui/Pill";

/**
 * Three steps. One receipt.
 * Numbered cards with mono `≈ 30s` timing pills. Body copy matches the brand
 * reference verbatim.
 */

const STEPS = [
  {
    n: "01",
    eta: "≈ 30s",
    title: "Vendor creates an invoice.",
    body: "Pick currency, line items, due date. Klaro generates a hosted page at i.klaro.me/<id>.",
  },
  {
    n: "02",
    eta: "≈ 8s",
    title: "Customer pays in USDC.",
    body: "From Arc, Base, Ethereum, anywhere. Klaro routes the funds and screens the counterparty.",
  },
  {
    n: "03",
    eta: "≈ 1.4s",
    title: "Receipt mints onchain.",
    body: "Both signatures, screening hash, settlement tx. Public, verifiable, shareable.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
      <SectionHeader eyebrow="How it works" title="Three steps. One receipt." />
      <ol className="mt-16 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {STEPS.map((s, i) => (
          <Fragment key={s.n}>
            <li className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg)] p-7 shadow-[0_1px_0_rgba(10,10,10,0.04),0_4px_16px_rgba(10,10,10,0.04)]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-[var(--color-klaro-orange)]">
                  {s.n}
                </span>
                <Pill tone="default" size="sm">{s.eta}</Pill>
              </div>
              <h3 className="mt-7 font-display text-xl font-semibold tracking-[-0.02em]">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                {s.body}
              </p>
            </li>
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="hidden text-center text-2xl text-[var(--color-muted-2)] md:inline-flex md:items-center md:justify-center"
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
