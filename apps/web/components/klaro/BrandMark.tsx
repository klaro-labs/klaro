/**
 * Klaro brand mark — compact K geometry matching the supplied lockup.
 * Used by:
 * - `Logo.tsx` (UI lockup with wordmark)
 * - `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`
 * (these inline the JSX via `next/og` ImageResponse — they cannot
 * import React components, only render shape primitives, so the
 * geometry constants live here for re-use.)
 */

export const BRAND_MARK_VIEWBOX = "0 0 24 24";

/** Tailwind / CSS-var aware fill colors. Hard-coded equivalents in INK_HEX
 * and BRAND_HEX so they can be passed to `ImageResponse` without CSS vars. */
export const INK_HEX = "#0A0A0A";
export const BRAND_HEX = "#C7522A";

export function BrandMark({
  size = 22,
  inkFill = "var(--color-ink)",
  brandFill = "var(--color-brand)",
}: {
  size?: number;
  inkFill?: string;
  brandFill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={BRAND_MARK_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Klaro"
    >
      <path d="M4 2V22" stroke={inkFill} strokeWidth="4" />
      <path d="M5.5 12L19 2" stroke={brandFill} strokeWidth="4" />
      <path d="M5.5 12L19 22" stroke={brandFill} strokeWidth="4" />
    </svg>
  );
}
