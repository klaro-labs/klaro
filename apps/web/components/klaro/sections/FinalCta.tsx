import Link from "next/link";
import { PULSE_SEED } from "@/lib/testnetMetrics";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * §16 Final CTA — dark band with dual CTA on the left, live event pulse
 * panel on the right. Pulse content reads from `lib/testnetMetrics.ts`
 * so the seam to a real SSE feed is one file.
 */

const KIND_COLOR: Record<(typeof PULSE_SEED)[number]["kind"], string> = {
  "invoice.created": "bg-emerald-400",
  "buyer.signed": "bg-[var(--color-brand)]",
  "payment.routed": "bg-violet-400",
  "lp.assigned": "bg-[var(--color-gold)]",
  "proof.submitted": "bg-rose-400",
};

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(80px,12vw,160px)]">
      <div className="overflow-hidden rounded-xl bg-[var(--color-ink)] text-white shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <div className="grid gap-10 p-8 md:grid-cols-[1.05fr_0.95fr] md:p-12">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/60">
              <span>Open testnet</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-emerald-400"
                />
                Testnet preview
              </span>
            </div>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-tight">
              Issue your first
              <br /> invoice in 90 seconds.
            </h2>
            <p className="mt-5 max-w-prose text-base text-white/70">
              No credit check. No US bank required. No waitlist. Klaro testnet
              is free for everyone. Sign up with Google or email, plug in your
              ERP, issue your first invoice in 90 seconds.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/signin"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-white text-[var(--color-ink)] hover:bg-white/90",
                )}
              >
                Create your account →
              </Link>
              <a
                href="mailto:sales@klaro.so"
                className={cn(
                  buttonVariants({ size: "lg", variant: "secondary" }),
                  "border-white/25 text-white hover:bg-white/10",
                )}
              >
                Talk to sales
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
              <li className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-emerald-400"
                />
                Testnet simulation clearly labelled
              </li>
              <li>SOC 2 Type II · in progress</li>
              <li>WCAG 2.2 AAA</li>
            </ul>
          </div>

          <PulsePanel />
        </div>
      </div>
    </section>
  );
}

function PulsePanel() {
  return (
    <aside className="rounded-lg border border-white/10 bg-[#0F0F12] p-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/55">
        <span>Sample · testnet pulse</span>
        <span className="text-emerald-300">arc · preview</span>
      </div>
      <ol className="mt-5 space-y-3">
        {PULSE_SEED.map((p) => (
          <li
            key={`${p.kind}-${p.age}`}
            className="flex items-center justify-between text-sm"
          >
            <span className="inline-flex items-center gap-2.5 font-mono text-white/80">
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${KIND_COLOR[p.kind]}`}
              />
              {p.kind} · <span className="text-white/60">{p.meta}</span>
            </span>
            <span className="text-xs text-white/45">{p.age}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[11px] text-white/35">
        Illustrative testnet event stream · no settlement claim
      </p>
    </aside>
  );
}
