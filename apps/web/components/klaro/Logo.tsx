import { BrandMark } from "./BrandMark";

/**
 * Klaro logo lockup — K mark + lowercase "klaro" wordmark.
 * Pass `tone="dark"` when rendering on dark backgrounds so the
 * ink-colored stem becomes white.
 */
export function Logo({ size = 22, tone = "default" }: { size?: number; tone?: "default" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark
        size={size}
        inkFill={tone === "dark" ? "white" : undefined}
        brandFill={tone === "dark" ? "var(--color-klaro-orange)" : undefined}
      />
      <span className="font-display text-base font-semibold tracking-tight">
        klaro
      </span>
    </span>
  );
}
