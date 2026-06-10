/**
 * Klaro brand mark. Filled K-as-arrow shape: ink stem on the left, two
 * solid Klaro-blue chevron triangles pointing right. Matches the brand-kit
 * reference (chunky blue K with a left-pointing-chevron stem).
 *
 * Used by Logo (with wordmark), favicon (`app/icon.tsx`), Apple touch icon
 * (`app/apple-icon.tsx`), Open Graph image (`app/opengraph-image.tsx`), PWA
 * icons (`app/icon0.tsx`, `app/icon1.tsx`). Geometry constants live here
 * so the ImageResponse routes can re-use them without importing React.
 */

export const BRAND_MARK_VIEWBOX = "0 0 24 24";

export const INK_HEX = "#0A0A0A";
// Feeds favicon/Apple-touch/OG/PWA marks. Source: internal/designer mockups.
export const BRAND_HEX = "#1B6BFF";

export function BrandMark({
  size = 22,
  inkFill = "var(--color-ink)",
  brandFill = "var(--color-klaro-orange)",
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
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Klaro"
    >
      {/* Stem — solid ink rectangle on the left third. */}
      <rect x="2" y="2" width="4.5" height="20" rx="0.5" fill={inkFill} />
      {/* Upper chevron — solid blue triangle pointing right. */}
      <path d="M6.5 12 L20 2 L20 6.5 L11.5 12 Z" fill={brandFill} />
      {/* Lower chevron — solid blue triangle pointing right. */}
      <path d="M6.5 12 L20 22 L20 17.5 L11.5 12 Z" fill={brandFill} />
    </svg>
  );
}
