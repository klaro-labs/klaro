import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Klaro pill: mono-cased, rounded-full label used for statuses, eyebrows that
 * sit in a pill shape, and meta tags. Source: brand kit §06 components.
 *
 * Variants:
 *   - warm: warm-soft background, terracotta-leaning copy. Default eyebrow.
 *   - gold: gold-soft background, used only for `verified` and Klaro Proof.
 *   - dark: ink background, white copy. Used inside dark sections.
 *   - default: warm paper background, ink copy. Neutral status.
 *   - outline: transparent with subtle border. Smallest visual weight.
 *
 * Include a leading dot via the `dot` prop for live/simulated indicators.
 */
export const pillVariants = cva(
  "inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] rounded-pill",
  {
    variants: {
      tone: {
        warm:
          "bg-[var(--color-klaro-orange-soft)] text-[var(--color-klaro-orange-deep)]",
        gold:
          "bg-[var(--color-klaro-gold-soft)] text-[var(--color-klaro-gold-deep)]",
        dark:
          "bg-[var(--color-bg-dark)] text-white",
        default:
          "bg-[var(--color-bg-warm)] text-[var(--color-ink-2)] border border-[var(--color-line)]",
        outline:
          "bg-transparent text-[var(--color-muted)] border border-[var(--color-line)]",
      },
      size: {
        sm: "px-2.5 py-0.5",
        md: "px-3 py-1",
      },
    },
    defaultVariants: { tone: "default", size: "md" },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  dot?: "live" | "warm" | "gold" | "muted" | null;
}

const DOT_TONE: Record<NonNullable<PillProps["dot"]>, string> = {
  live: "bg-emerald-500",
  warm: "bg-[var(--color-klaro-orange)]",
  gold: "bg-[var(--color-klaro-gold)]",
  muted: "bg-[var(--color-muted-2)]",
};

export const Pill = forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone, size, dot = null, children, ...props }, ref) => (
    <span ref={ref} className={cn(pillVariants({ tone, size }), className)} {...props}>
      {dot ? (
        <span aria-hidden className={`inline-block size-1.5 rounded-full ${DOT_TONE[dot]}`} />
      ) : null}
      {children}
    </span>
  ),
);
Pill.displayName = "Pill";
