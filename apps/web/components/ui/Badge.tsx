import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Klaro Badge — pill-shaped status indicator used across:
 * - hero ("Open testnet · Live on Arc")
 * - testnet truth table ("Live on testnet" / "Simulated" / "Lab preview")
 * - receipts ("VERIFIED")
 * (no overclaiming): every label this component renders must
 * accurately reflect testnet reality. New variants only when a new honest
 * state appears in the design spec.
 *
 * Usage: Badge = semantic colored status (live/info/neutral/verified/danger/
 * warning); Pill = mono meta/eyebrow tag. Reach for Badge when the chip
 * conveys an operational state, Pill when it is a label or category tag.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        live: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
        info: "bg-[var(--color-brand-soft)] text-[var(--color-klaro-orange-deep)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
        neutral:
          "bg-[var(--color-bg-elevated)] text-[var(--color-ink-muted)] ring-1 ring-inset ring-[var(--color-line)]",
        verified:
          "bg-[color-mix(in_oklab,var(--color-gold)_15%,white)] text-[var(--color-klaro-gold-deep)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-gold)_35%,transparent)]",
        sim: "bg-[var(--color-bg-elevated)] text-[var(--color-ink-muted)] ring-1 ring-inset ring-[var(--color-line)]",
        danger:
          "bg-[color-mix(in_oklab,var(--color-danger)_12%,white)] text-[var(--color-danger)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]",
        warning:
          "bg-[color-mix(in_oklab,var(--color-warning)_15%,white)] text-[color-mix(in_oklab,var(--color-warning)_55%,var(--color-ink))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-warning)_35%,transparent)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
