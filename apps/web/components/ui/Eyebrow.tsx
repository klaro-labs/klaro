import { cn } from "@/lib/cn";

/**
 * Mono uppercase section eyebrow. Always sits above the section title with
 * a 12-16px gap. Source: brand kit §04 typography.
 *
 *   <Eyebrow>The platform</Eyebrow>
 *   <h2 className="klaro-display">An Arc-native payment OS…</h2>
 *
 * On dark sections use `tone="gold"` so the eyebrow stays legible.
 */
export function Eyebrow({
  tone = "warm",
  className,
  children,
}: {
  tone?: "warm" | "gold";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
        tone === "gold"
          ? "text-[var(--color-klaro-gold)]"
          : "text-[var(--color-klaro-orange-deep)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
