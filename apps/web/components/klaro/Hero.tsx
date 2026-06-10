import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Hero — one-shot pitch above the fold.
 * Honest labels: "Open testnet · Built for Arc" makes status clear before
 * users scroll. "Free during testnet" sets expectations.
 * Headline mirrors the brand reference verbatim — "Get paid in seconds."
 * with `seconds` in Klaro blue, then "Not weeks." on its own line.
 */
export function Hero() {
  return (
    <section className="relative isolate mx-auto w-full max-w-[1280px] overflow-hidden px-[clamp(20px,4vw,56px)] pt-16 pb-12 md:pt-[112px] md:pb-16">
      {/* Subtle warm radial-glow upper-right per brand reference. Absolute,
          decorative (aria-hidden), pointer-events-none, isolated to its own
          stacking context so it can never block CTAs or selection. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-25%] -z-10 h-[760px] w-[760px] rounded-full bg-[var(--color-klaro-orange)] opacity-[0.02] blur-[160px]"
      />
      <div className="md:-translate-y-2">
        <div className="max-w-[1000px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone="info"
              className="font-mono text-[11px] tracking-[0.08em]"
            >
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-[var(--color-brand)]"
              />
              Open testnet · live on Arc
            </Badge>
            <Badge tone="neutral">USDC · EURC · CCTP V2</Badge>
          </div>

          <h1 className="mt-7 font-display text-[clamp(3.4rem,7.6vw,7rem)] font-semibold leading-[0.95] tracking-[-0.06em]">
            Get paid in{" "}
            <span className="text-[var(--color-brand)]">seconds.</span>
            <br />
            Not weeks.
          </h1>

          <p className="mt-8 max-w-[40rem] text-lg leading-[1.42] text-[var(--color-muted)] md:text-[1.25rem]">
            Klaro helps vendors invoice globally in USDC, prove every payment
            onchain, build financial reputation, and cash out through verified
            partners.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signin" className={buttonVariants({ size: "lg" })}>
              Create your first invoice →
            </Link>
            <Link
              href="/product/receipts"
              className={buttonVariants({ size: "lg", variant: "secondary" })}
            >
              See a real receipt
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--color-muted)]">
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-emerald-500"
              />
              All systems operational
            </li>
            <li aria-hidden className="font-mono text-[var(--color-ink-subtle)]">
              ·
            </li>
            <li>Free during testnet</li>
            <li aria-hidden className="font-mono text-[var(--color-ink-subtle)]">
              ·
            </li>
            <li>Arc-native · Circle Wallets</li>
          </ul>
        </div>
      </div>
      <HeroDemo />
    </section>
  );
}

/**
 * HeroDemo — the dual-card mockup (Invoice + Stenn-Proof receipt) from the
 * landing. Static SSR preview is explicitly labelled as simulated so it never
 * represents a completed live payment or screening result.
 */
function HeroDemo() {
  return (
    <div className="relative mt-16 grid gap-5 md:grid-cols-[1.08fr_0.92fr]">
      {/* Hosted invoice card */}
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
        <div className="flex items-center justify-between text-[11px] tracking-wider text-[var(--color-ink-subtle)] uppercase">
          <span>Hosted invoice · myklaro.app/i</span>
          <Badge tone="live">Paid · 1.4s</Badge>
        </div>
        <p className="mt-3 font-mono text-xs text-[var(--color-ink-muted)]">
          cl7-d3-m0
        </p>
        <p className="mt-4 text-[11px] tracking-wider text-[var(--color-ink-subtle)] uppercase">
          Amount due
        </p>
        <p className="mt-1 font-display text-4xl font-semibold tracking-tight">
          $4,200.00
        </p>
        <div className="mt-5 flex items-end justify-between text-right text-sm">
          <div />
          <div>
            <p className="text-[var(--color-ink-subtle)]">To</p>
            <p>Asha Pune</p>
            <p className="text-[var(--color-ink-subtle)]">Pune, IN</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-lg border border-[var(--color-line)] px-4 py-3 text-sm">
          <span className="text-[var(--color-ink-muted)]">
            Backend dev — week 17 sprint
          </span>
          <span className="font-mono">$4,200.00</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-pill bg-[var(--color-ink)] px-5 py-3 text-center text-sm font-medium text-white">
            Pay with USDC
          </div>
          <div className="rounded-pill border border-dashed border-[var(--color-line)] px-5 py-3 text-center text-sm text-[var(--color-ink-muted)]">
            Pay with card{" "}
            <span className="font-mono text-[10px] text-[var(--color-brand)]">
              MAINNET ONLY
            </span>
          </div>
        </div>
      </div>

      {/* Stenn-Proof receipt card */}
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
        <div className="flex items-center justify-between text-[11px] tracking-wider text-[var(--color-ink-subtle)] uppercase">
          <span>Stenn-Proof receipt</span>
          <Badge tone="verified">VERIFIED</Badge>
        </div>
        <p className="mt-3 font-mono text-xs text-[var(--color-ink-muted)]">
          cl7-d3-m0
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-[var(--color-ink-subtle)]">Amount</dt>
          <dd className="text-[var(--color-ink)]">$4,200.00 USD</dd>
          <dt className="text-[var(--color-ink-subtle)]">Received</dt>
          <dd className="text-[var(--color-ink)]">4,200.00 USDC</dd>
          <dt className="text-[var(--color-ink-subtle)]">Vendor</dt>
          <dd className="text-[var(--color-ink)]">0x7a3c…b21f</dd>
          <dt className="text-[var(--color-ink-subtle)]">Customer</dt>
          <dd className="text-[var(--color-ink)]">0xc41e…9d02</dd>
          <dt className="text-[var(--color-ink-subtle)]">Buyer accept</dt>
          <dd className="text-[var(--color-ink)]">EIP-712 signed</dd>
          <dt className="text-[var(--color-ink-subtle)]">Screening</dt>
          <dd className="text-[var(--color-ink)]">passed</dd>
          <dt className="text-[var(--color-ink-subtle)]">Settled</dt>
          <dd className="text-[var(--color-ink)]">1.4s · Arc</dd>
          <dt className="text-[var(--color-ink-subtle)]">tx</dt>
          <dd className="text-[var(--color-ink)]">0x9f8a3c5b…d8f0e</dd>
        </dl>
      </div>
    </div>
  );
}
