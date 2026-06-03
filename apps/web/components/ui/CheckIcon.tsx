/**
 * Klaro check glyph — a stroked SVG check that inherits `currentColor`, so it
 * matches the Lucide/stroke-SVG icon language instead of rendering as a raw
 * Unicode "✓" emoji (which paints inconsistently per OS). Use this everywhere a
 * success/affordance checkmark is needed.
 *
 *   <CheckIcon className="size-4" />
 */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
