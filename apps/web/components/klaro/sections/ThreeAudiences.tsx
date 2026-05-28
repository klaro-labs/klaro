import { SectionHeader } from "../SectionHeader";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * §10 Three audiences — Vendors / Buyers / Developers cards.
 * Middle card is dark (designer pattern); each ends with an action link.
 */

interface Audience {
  eyebrow: string;
  title: string;
  bullets: string[];
  cta: string;
  href: "/signin" | "/product" | "/build";
  tone: "light" | "dark" | "light-secondary";
}

const A: Audience[] = [
  {
    eyebrow: "Vendors",
    title: "Get paid globally in 8 seconds, not 5 days.",
    bullets: [
      "Issue an invoice in 30 seconds",
      "Preview USDC checkout in simulator mode",
      "Simulate INR cashout with review and disputes",
      "Preview portable reputation UX",
    ],
    cta: "Create your first invoice",
    href: "/signin",
    tone: "light",
  },
  {
    eyebrow: "Buyers",
    title: "Pay any vendor in USDC, from any chain.",
    bullets: [
      "Preview buyer payment flow",
      "One amount, demo checkout",
      "Live wallet signing remains gated",
      "Get a labelled receipt preview",
    ],
    cta: "See how checkout works",
    href: "/product",
    tone: "dark",
  },
  {
    eyebrow: "Developers",
    title: "Open SDK. Public receipts. Fork the reference app.",
    bullets: [
      "Apache-2.0 contracts on GitHub",
      "TypeScript SDK · @klaro/sdk on npm",
      "ERC-8183 reference implementation",
      "Public OpenAPI · docs.klaro.so",
    ],
    cta: "Read the docs",
    href: "/build",
    tone: "light-secondary",
  },
];

export function ThreeAudiences() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
      <SectionHeader
        eyebrow="For everyone in the loop"
        title={
          <>
            One product.
            <br /> Three jobs to be done.
          </>
        }
      />

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {A.map((a) => (
          <AudienceCard key={a.title} audience={a} />
        ))}
      </div>
    </section>
  );
}

function AudienceCard({ audience: a }: { audience: Audience }) {
  const isDark = a.tone === "dark";
  return (
    <article
      className={cn(
        "rounded-lg p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)]",
        a.tone !== "dark"
          ? "border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-[var(--color-ink)]"
          : "bg-[var(--color-ink)] text-white",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.18em]",
          isDark ? "text-[var(--color-gold)]" : "text-[var(--color-brand)]",
        )}
      >
        {a.eyebrow}
      </p>
      <h3
        className={cn(
          "mt-3 font-display text-xl font-semibold tracking-tight leading-snug",
          isDark && "text-white",
        )}
      >
        {a.title}
      </h3>
      <ul className="mt-5 space-y-2.5 text-sm">
        {a.bullets.map((b) => (
          <li
            key={b}
            className={cn(
              "flex items-start gap-2",
              isDark ? "text-white/80" : "text-[var(--color-ink-muted)]",
            )}
          >
            <Check
              aria-hidden
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                isDark
                  ? "text-[var(--color-gold)]"
                  : "text-[var(--color-brand)]",
              )}
            />
            {b}
          </li>
        ))}
      </ul>
      <Link
        href={a.href}
        className={cn(
          "mt-6 inline-block text-sm font-medium",
          isDark ? "text-white" : "text-[var(--color-brand)]",
        )}
      >
        {a.cta} →
      </Link>
    </article>
  );
}
