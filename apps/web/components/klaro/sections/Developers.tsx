import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Developers section — code snippet plus link grid. The snippet stays
 * minimal but matches the published SDK signature. Plain `<pre><code>` is
 * intentional — adding a syntax highlighter (e.g. `shiki`) is deferred
 * until the bundle-size budget can absorb it.
 */

const SNIPPET = `// npm i @klaro/sdk
import { Klaro } from "@klaro/sdk";

const klaro = new Klaro({ apiKey: process.env.KLARO_KEY });

// Issue an invoice — paid in seconds
const invoice = await klaro.invoices.create({
  amount: 4_200_00,             // cents
  currency: "USD",
  receiveAs: "USDC",            // or "INR", "BRL", "MXN"…
  customer: { email: "client@nyc-saas.demo" },
  lineItems: [
    { description: "Backend dev — Week 17 sprint", amount: 4_200_00 },
  ],
  autoSweep: true,              // sweep to vendor's local fiat
});

console.log(invoice.hostedUrl);
// → https://i.klaro.so/cl7-d3-m0

// Verify any Stenn-Proof receipt
const ok = await klaro.receipts.verify("0x9f8a3c5b…");
// → { verified: true, screened: true, settledAt: 1737293728 }`;

export function Developers() {
  return (
    <section className="bg-[var(--color-ink)] text-white">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-gold)]">
              For developers
            </p>
            <h2 className="mt-3 font-display text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.05] tracking-tight">
              A receipts API,
              <br /> not another platform.
            </h2>
            <p className="mt-4 max-w-prose text-base text-white/70">
              REST & TypeScript SDKs. Open-source receipt badge. The full
              ERC-8183 reference contract. Build invoicing into your product
              without becoming a fintech.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/developers"
                className={cn(
                  buttonVariants({ variant: "primary", size: "md" }),
                  // Override colors so primary CTA reads on dark band
                  "bg-white text-[var(--color-ink)] hover:bg-white/90",
                )}
              >
                Read the docs
              </Link>
              <Link
                href="/developers"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "md" }),
                  "border border-white/25 ring-0 text-white hover:bg-white/10",
                )}
              >
                View on GitHub
              </Link>
            </div>

            {/* Designer 2026-05-25 parity: 4 cards advertise the open-source
                surface (license/SDK/reference/docs URL), not runtime metrics. */}
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
              <DevStat n="GitHub" label="Apache-2.0 contracts" />
              <DevStat n="in dev" label="TypeScript SDK" />
              <DevStat n="MIT" label="ERC-8183 reference" />
              <DevStat n="docs.klaro.so" label="OpenAPI spec" />
            </dl>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0F0F12] shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-2 border-b border-white/10 bg-[#16161A] px-4 py-2.5">
              <span aria-hidden className="size-2.5 rounded-full bg-rose-400" />
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-amber-400"
              />
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-emerald-400"
              />
              <span className="ml-3 font-mono text-xs text-white/60">
                invoice.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-6 text-[12px] leading-relaxed text-white/85">
              <code className="font-mono">{SNIPPET}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function DevStat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold tracking-tight">{n}</p>
      <p className="mt-1 text-xs text-white/60">{label}</p>
    </div>
  );
}
