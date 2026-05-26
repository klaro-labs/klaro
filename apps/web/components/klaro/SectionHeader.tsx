import { cn } from "@/lib/cn";

/**
 * SectionHeader — eyebrow + headline + optional lede.
 * Used by every landing section so the typographic rhythm stays consistent.
 * Designer pattern: tiny uppercase eyebrow in brand blue → bold display
 * headline (often two lines) → muted body lede.
 */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    // Designer 2026-05-25 parity: max-w-4xl (was 2xl) so two-line h2's like
    // "An Arc-native payment OS for emerging-market vendors." don't wrap
    // awkwardly mid-word. Eyebrow uses mono font per brand-kit §04 (mono = labels).
    <header
      className={cn(
        align === "center" ? "text-center mx-auto" : "",
        "max-w-4xl",
        className,
      )}
    >
      <p className="font-mono text-[11px] font-normal tracking-[0.2em] uppercase text-[var(--color-brand)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight">
        {title}
      </h2>
      {lede ? (
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
          {lede}
        </p>
      ) : null}
    </header>
  );
}
