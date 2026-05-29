import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Pill } from "@/components/ui/Pill";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Build · Klaro",
  description:
    "Build payment flows in under 30 lines. REST API, TypeScript SDK, webhooks, and a sandbox that boots without credentials.",
};

const CAPABILITIES = [
  {
    title: "REST API",
    desc: "Create invoices, trigger cashouts, verify receipts. JSON in, JSON out. Versioned, idempotent, rate-limited. OpenAPI 3.1 spec at /api/openapi.",
  },
  {
    title: "Webhooks",
    desc: "Real-time delivery with HMAC signatures, automatic retries with exponential back-off, and a dead-letter queue you can replay from the dashboard.",
  },
  {
    title: "TypeScript SDK",
    desc: "@klaro/sdk wraps every endpoint with typed responses, automatic retry on idempotent calls, and BigInt-safe serialization for USDC amounts.",
  },
  {
    title: "Sandbox",
    desc: "The app boots without environment variables. Every external surface (Circle, Resend, MoonPay, Sumsub) falls back to a labelled simulated mode.",
  },
];

const RELIABILITY = [
  {
    title: "Auth, per request.",
    desc: "API keys are scoped per environment. Rotate without downtime. Every key carries an audit trail of every call it made.",
  },
  {
    title: "Idempotency, by default.",
    desc: "Pass an idempotency key on any POST. We dedupe for 24 hours and return the original response. Safe to retry on network failure.",
  },
  {
    title: "Retries, with budget.",
    desc: "Webhook deliveries retry on a 1m / 5m / 30m / 4h / 24h schedule. After 5 failures the event lands in the DLQ and surfaces in your dashboard.",
  },
];

// Real-ish SDK quickstart. Reproduces the shape of `lib/api.ts::createInvoice`.
const CODE_SDK = `import { Klaro } from "@klaro/sdk";

const klaro = new Klaro({
  apiKey: process.env.KLARO_KEY,
  network: "arc-testnet",
});

const invoice = await klaro.invoices.create({
  amount: 4_200_00,                 // cents
  currency: "USD",
  receiveAs: "USDC",                // settled in USDC on Arc
  customer: { email: "client@example.com" },
  lineItems: [
    { description: "Week 17 sprint", amount: 4_200_00 },
  ],
}, { idempotencyKey: crypto.randomUUID() });

console.log(invoice.hostedUrl);
// → https://i.klaro.so/cl7-d3-m0`;

// Real-ish cURL equivalent — same shape as our /api/v1/invoices route.
const CODE_CURL = `curl -X POST https://api.klaro.so/v1/invoices \\
  -H "Authorization: Bearer $KLARO_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 420000,
    "currency": "USD",
    "receiveAs": "USDC",
    "customer": { "email": "client@example.com" },
    "lineItems": [
      { "description": "Week 17 sprint", "amount": 420000 }
    ]
  }'`;

const REFERENCE_LINKS: Array<{ label: string; sub: string; href: string }> = [
  { label: "API reference", sub: "Every endpoint, every webhook payload.", href: "/docs" },
  { label: "User flows", sub: "State machines for invoice, payment, cashout.", href: "/resources/flows" },
  { label: "Status", sub: "Live testnet health and incident history.", href: "/status" },
];

export default function BuildPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Build"
        chips={["REST", "TypeScript", "Webhooks"]}
        title="Build payment flows in under 30 lines."
        sub="Issue invoices, verify receipts, and trigger cashouts from your backend. The SDK handles auth, retries, and BigInt serialization. The sandbox boots without credentials."
        ctas={[
          { label: "Get an API key", href: "/vendor/settings#api-keys" },
          { label: "Read the docs", href: "/docs", variant: "secondary" },
        ]}
      />

      {/* Quickstart with code + result panel */}
      <section className="klaro-container pb-20">
        <div className="grid gap-8 md:grid-cols-[1fr_1.25fr] md:items-start">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
              Quickstart
            </p>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Create your first invoice.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
              Install the SDK or call the REST endpoint directly. Either way you get back a hosted payment URL you can send to your customer. The response shape is the same.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--color-muted)]">
              <li className="flex gap-2">
                <span aria-hidden className="text-[var(--color-klaro-orange)]">→</span>
                <span>
                  <code className="rounded bg-[var(--color-bg-warm)] px-1.5 py-0.5 font-mono text-xs">invoices.create</code> returns <code className="rounded bg-[var(--color-bg-warm)] px-1.5 py-0.5 font-mono text-xs">hostedUrl</code> in &lt; 200ms.
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-[var(--color-klaro-orange)]">→</span>
                <span>
                  Customer pays in USDC on Arc. We mint a Stenn-Proof receipt and POST <code className="rounded bg-[var(--color-bg-warm)] px-1.5 py-0.5 font-mono text-xs">invoice.paid</code> to your webhook URL.
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-[var(--color-klaro-orange)]">→</span>
                <span>
                  Verify the signature with <code className="rounded bg-[var(--color-bg-warm)] px-1.5 py-0.5 font-mono text-xs">verifyKlaroSignature</code> and you&rsquo;re done.
                </span>
              </li>
            </ul>
          </div>

          <CodeCard
            tabs={[
              { id: "sdk", label: "@klaro/sdk", code: CODE_SDK },
              { id: "curl", label: "cURL", code: CODE_CURL },
            ]}
          />
        </div>
      </section>

      {/* Capabilities — REST · Webhooks · SDK · Sandbox */}
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Everything you need
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          REST, webhooks, SDK, sandbox.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <FeatureCard key={c.title} title={c.title}>
              {c.desc}
            </FeatureCard>
          ))}
        </div>
      </section>

      {/* Engineering reassurance: auth / idempotency / retries */}
      <section className="klaro-container pb-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Boring infrastructure
        </p>
        <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-tight">
          Auth, idempotency, retries &mdash; handled.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {RELIABILITY.map((c) => (
            <FeatureCard key={c.title} title={c.title}>
              {c.desc}
            </FeatureCard>
          ))}
        </div>
      </section>

      {/* Reference link strip */}
      <section className="klaro-container pb-20">
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
                Read the reference
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">
                Three places to dig deeper.
              </h2>
            </div>
            <Pill tone="warm" size="sm" dot="warm">
              live testnet
            </Pill>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {REFERENCE_LINKS.map((r) => (
              <Link
                key={r.href}
                href={r.href as Route}
                className="group flex items-center justify-between gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-5 py-4 transition-all hover:border-[var(--color-ink)] hover:-translate-y-0.5"
              >
                <div>
                  <p className="font-display text-sm font-semibold">{r.label}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{r.sub}</p>
                </div>
                <ArrowRight className="size-4 text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-klaro-orange)]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA tuned to developer audience. */}
      <section className="klaro-container pb-20">
        <div className="overflow-hidden rounded-xl bg-[var(--color-ink)] p-8 text-white md:p-12">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-gold)]">
            Ready to build
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-tight">
            Open a workspace, mint a key, ship an invoice.
          </h2>
          <p className="mt-4 max-w-xl text-base text-white/70">
            Sign in with Google or email. Generate a testnet API key from the settings screen. Send your first invoice in the next ten minutes.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={"/vendor/settings#api-keys" as Route}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-white text-[var(--color-ink)] hover:bg-white/90",
              )}
            >
              Get an API key
            </Link>
            <Link
              href={"/docs" as Route}
              className={cn(
                buttonVariants({ size: "lg", variant: "secondary" }),
                "text-white ring-white/25 hover:bg-white/10",
              )}
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <FinalCta />
      <Footer />
    </main>
  );
}

/* ─── Tabbed code card ────────────────────────────────────────────── */

interface Tab {
  id: string;
  label: string;
  code: string;
}

function CodeCard({ tabs }: { tabs: Tab[] }) {
  // CSS-only tabs via <details>/radio would lose accessibility; we render
  // both panels and use a visual chrome on the first tab as the headliner.
  // (Interactive switching is a client concern; this page is RSC-only.)
  const [primary, ...rest] = tabs;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-dark)] shadow-[0_4px_16px_rgba(10,10,10,0.08)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[var(--color-bg-dark-2)] px-4 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-rose-400" />
        <span aria-hidden className="size-2.5 rounded-full bg-amber-400" />
        <span aria-hidden className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 font-mono text-xs text-white/60">{primary.label}</span>
        <span className="ml-auto inline-flex gap-3 font-mono text-[11px] text-white/45">
          {rest.map((t) => (
            <span key={t.id}>{t.label}</span>
          ))}
        </span>
      </div>
      <pre className="overflow-x-auto p-6 text-[12px] leading-relaxed text-white/85">
        <code className="font-mono">{primary.code}</code>
      </pre>
      {rest.map((t) => (
        <details key={t.id} className="border-t border-white/10">
          <summary className="cursor-pointer px-4 py-3 font-mono text-xs text-white/55 hover:text-white">
            Show {t.label} equivalent
          </summary>
          <pre className="overflow-x-auto px-6 pb-6 text-[12px] leading-relaxed text-white/85">
            <code className="font-mono">{t.code}</code>
          </pre>
        </details>
      ))}
    </div>
  );
}
