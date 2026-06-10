import Link from "next/link";
import type { Route } from "next";
import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/**
 * §5 Platform OS — four surface previews in a 2×2 grid.
 * Two cards are light, two are dark (designer pattern). Each card has an
 * eyebrow + headline + lede + a tiny visual sample of the surface state.
 */

interface Surface {
  eyebrow: string;
  badgeTone: "live" | "info" | "neutral";
  badge: string;
  title: string;
  lede: string;
  variant: "light" | "dark" | "brand";
  sample: React.ReactNode;
  cta: string;
  href: Route;
}

const SURFACES: Surface[] = [
  {
    eyebrow: "Surface 1 · demo checkout",
    badgeTone: "info",
    badge: "Integration pending",
    title: "Invoices prepared for Arc settlement.",
    lede: "Issue a hosted invoice and complete a labelled demo checkout. Arc and cross-chain settlement require configured live integrations.",
    variant: "light",
    sample: <InvoiceRouteSample />,
    cta: "See the checkout",
    href: "/product/invoicing",
  },
  {
    eyebrow: "Surface 2 · INR pilot · testnet simulation",
    badgeTone: "info",
    badge: "Simulated",
    title: "Partner Cashout. USDC → INR.",
    lede: "Vendors in India preview a controlled payout and dispute workflow. No partner proof, INR, stake, or USDC moves in simulator mode.",
    variant: "dark",
    sample: <CashoutSample />,
    cta: "How payouts work",
    href: "/product/cashout",
  },
  {
    eyebrow: "Surface 3 · simulated reputation",
    badgeTone: "info",
    badge: "Demo score",
    title: "Reputation that earns its score.",
    lede: "Demo invoice and cashout events illustrate a future Trust Score. No onchain reputation record is claimed in simulator mode.",
    variant: "light",
    sample: <TrustScoreSample />,
    cta: "How scoring works",
    href: "/product/reputation",
  },
  {
    eyebrow: "Klaro Lab · access-gated previews",
    badgeTone: "neutral",
    badge: "Lab preview",
    title: "StableFX, agents, and what's next.",
    lede: "StableFX, agent identity, and escrow are access-gated previews. Local stable routes remain simulations until integrations and partners are live.",
    variant: "brand",
    sample: <LabSample />,
    cta: "Request access",
    href: "/signin",
  },
];

export function PlatformOS() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
      <SectionHeader
        eyebrow="The platform"
        title={
          <>
            An Arc-native payment OS
            <br /> for emerging-market vendors.
          </>
        }
        lede="Preview global USDC invoicing, public receipts, controlled cashout workflows, and reputation UX. Live integrations activate only after verification."
      />

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {SURFACES.map((s) => (
          <SurfaceCard key={s.title} surface={s} />
        ))}
      </div>
    </section>
  );
}

function SurfaceCard({ surface }: { surface: Surface }) {
  const isDark = surface.variant === "dark";
  const isBrand = surface.variant === "brand";
  return (
    <article
      className={cn(
        "rounded-lg p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)]",
        surface.variant === "light" &&
          "border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-[var(--color-ink)]",
        isDark && "bg-[var(--color-ink)] text-white",
        isBrand && "bg-[var(--color-klaro-orange-deep)] text-white",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-medium tracking-[0.18em] uppercase",
            isDark || isBrand ? "text-white/90" : "text-[var(--color-brand)]",
          )}
        >
          {surface.eyebrow}
        </span>
        <Badge tone={surface.badgeTone}>{surface.badge}</Badge>
      </div>
      <h3
        className={cn(
          "mt-6 font-display text-2xl font-semibold leading-snug tracking-tight",
          (isDark || isBrand) && "text-white",
        )}
      >
        {surface.title}
      </h3>
      <p
        className={cn(
          "mt-3 text-sm leading-relaxed",
          isDark || isBrand ? "text-white/80" : "text-[var(--color-ink-muted)]",
        )}
      >
        {surface.lede}
      </p>
      <div className="mt-6">{surface.sample}</div>
      <Link
        href={surface.href}
        className={cn(
          "mt-6 inline-flex items-center gap-1 text-sm font-medium hover:underline",
          isDark || isBrand ? "text-white" : "text-[var(--color-brand)]",
        )}
      >
        {surface.cta} →
      </Link>
    </article>
  );
}

/* Inline samples kept tiny + presentational. Each is a stylized
   "what you'd see" not a real interaction. Replace with screenshot or
   real data viz in M3 polish. */

function InvoiceRouteSample() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-[11px] text-[var(--color-ink-muted)]">
      <span className="text-center">
        Any chain
        <br />
        USDC
      </span>
      <span aria-hidden>→</span>
      <span className="text-center">
        Arc
        <br />
        escrow
      </span>
      <span aria-hidden>→</span>
      <span className="text-center">
        Vendor
        <br />
        balance
      </span>
    </div>
  );
}

function CashoutSample() {
  return (
    <dl className="grid grid-cols-3 gap-3 rounded-md border border-white/10 bg-white/5 p-4 text-xs">
      <Stat label="You give" value="2,400 USDC" />
      <Stat label="You receive" value="₹2,01,360" />
      <Stat label="ETA" value="~12 min" />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/60">{label}</dt>
      <dd className="mt-1 font-medium text-white">{value}</dd>
    </div>
  );
}

function TrustScoreSample() {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--color-ink-subtle)]">
          Trust Score
        </span>
        <span className="font-display text-2xl font-semibold">
          724
          <span className="text-base text-[var(--color-ink-subtle)]">/900</span>
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-[var(--color-ink-muted)]">
        <li>
          ✓ 42 invoices settled clean{" "}
          <span className="text-emerald-700">+18</span>
        </li>
        <li>
          ✓ ERP connected · Tally <span className="text-emerald-700">+12</span>
        </li>
        <li>
          ✓ 14 clean cashouts <span className="text-emerald-700">+9</span>
        </li>
      </ul>
    </div>
  );
}

function LabSample() {
  const items = [
    { label: "USDC ↔ EURC · StableFX", tag: "Live" },
    { label: "Agent escrow · ERC-8183", tag: "Preview" },
    { label: "Reputation · ERC-8004", tag: "Preview" },
    { label: "USDC → BRL · Avenia BRLA", tag: "Simulation" },
  ];
  return (
    <ul className="space-y-1.5 rounded-md border border-white/15 bg-white/5 p-3 text-xs">
      {items.map((i) => (
        <li
          key={i.label}
          className="flex items-center justify-between text-white/90"
        >
          <span>{i.label}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
            {i.tag}
          </span>
        </li>
      ))}
    </ul>
  );
}
