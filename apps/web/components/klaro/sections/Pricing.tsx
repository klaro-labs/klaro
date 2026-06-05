import Link from "next/link";
import { Check } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * §15 Pricing — 3 tier cards.
 * Middle card (Standard / Mainnet target) is dark + filled CTA — designer's
 * emphasis pattern for the recommended path.
 */

interface Tier {
  name: string;
  badge: string;
  badgeTone: "neutral" | "live" | "info";
  price: string;
  priceFootnote?: string;
  body: string;
  bullets: string[];
  cta: string;
  variant: "light" | "dark" | "light-secondary";
}

const TIERS: Tier[] = [
  {
    name: "Testnet",
    badge: "Now · everyone",
    badgeTone: "neutral",
    price: "Free",
    body: "All features. No caps. Testnet tokens only — no real revenue collected.",
    bullets: [
      "Hosted invoice demo · USDC display flow",
      "Stenn-Proof receipt preview · clearly simulated",
      "Partner Cashout simulator · USDC → INR",
      "Tally, QuickBooks, Xero sandbox sync",
      "Reputation preview · contracts not deployed",
      "Community support · myklaro.app/docs",
    ],
    cta: "Create account",
    variant: "light",
  },
  {
    name: "Standard",
    badge: "Mainnet target",
    badgeTone: "neutral",
    price: "1.0%",
    priceFootnote:
      "Flat on settled volume. No monthly fee. Partner-payout fees passed through transparently.",
    body: "",
    bullets: [
      "Everything in Testnet",
      "Partner Cashout · pending verified partners",
      "Controlled release after verified proof",
      "Full corridor activation as partners go live",
      "Webhook delivery + retries",
      "Priority support · SLA 4h",
    ],
    cta: "Create account",
    variant: "dark",
  },
  {
    name: "Scale",
    badge: "Custom",
    badgeTone: "neutral",
    price: "Talk to us",
    body: "For platforms reselling Klaro under their own brand or LPs running large payout networks.",
    bullets: [
      "White-label invoicing surface",
      "Dedicated infrastructure",
      "Custom screening rules + manual review",
      "Priority support + on-call (at GA)",
      "Named contact · reporting",
      "Invite-only LP onboarding",
    ],
    cta: "Contact sales",
    variant: "light-secondary",
  },
];

export function Pricing() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
      <SectionHeader
        eyebrow="Pricing"
        title={
          <>
            Free on testnet.
            <br /> Honest on mainnet.
          </>
        }
        lede="No monthly fee. No setup fee. No per-seat fee. No undisclosed FX markup. During testnet every feature is free — no real money moves anyway. Mainnet rates lock in at launch."
        className="max-w-2xl"
      />

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {TIERS.map((t) => (
          <TierCard key={t.name} tier={t} />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-[var(--color-ink-subtle)]">
        Klaro is not a bank. Mainnet payout fees, limits, and settlement times
        depend on the licensed partner in each corridor.
      </p>
    </section>
  );
}

function TierCard({ tier: t }: { tier: Tier }) {
  const isDark = t.variant === "dark";
  return (
    <article
      className={cn(
        "rounded-lg p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)]",
        isDark
          ? "bg-[var(--color-ink)] text-white"
          : "border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-[var(--color-ink)]",
      )}
    >
      <div className="flex items-center justify-between">
        <h3
          className={cn(
            "font-display text-xl font-semibold",
            isDark && "text-white",
          )}
        >
          {t.name}
        </h3>
        <Badge tone={t.badgeTone}>{t.badge}</Badge>
      </div>
      <p
        className={cn(
          "mt-6 font-display text-5xl font-semibold tracking-tight",
          isDark && "text-white",
        )}
      >
        {t.price}
      </p>
      {t.priceFootnote ? (
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed",
            isDark ? "text-white/70" : "text-[var(--color-ink-muted)]",
          )}
        >
          {t.priceFootnote}
        </p>
      ) : t.body ? (
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed",
            isDark ? "text-white/70" : "text-[var(--color-ink-muted)]",
          )}
        >
          {t.body}
        </p>
      ) : null}

      <ul className="mt-7 space-y-2.5 text-sm">
        {t.bullets.map((b) => (
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

      <div className="mt-8">
        <Link
          href={t.name === "Scale" ? "mailto:prateek@myklaro.app" : "/signin"}
          className={cn(
            buttonVariants({ size: "md", variant: "secondary" }),
            "w-full",
            isDark &&
              "bg-white text-[var(--color-ink)] ring-0 hover:bg-white/90",
          )}
        >
          {t.cta}
        </Link>
      </div>
    </article>
  );
}
