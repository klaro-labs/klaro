import { BrandMark } from "./BrandMark";

/**
 * Klaro logo lockup — 3-rect K mark + lowercase "klaro" wordmark.
 * SVG geometry shared with favicon / apple-icon / OG via `BrandMark`.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark size={size} />
      <span className="font-display text-base font-semibold tracking-tight">
        klaro
      </span>
    </span>
  );
}
