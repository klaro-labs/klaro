/** Brand-aligned skeleton block. Used by every `loading.tsx` so the
 * shimmer is consistent across surfaces. */
export function Skeleton({
  className = "",
  width,
  height = 16,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const w = typeof width === "number" ? `${width}px` : (width ?? "100%");
  const h = typeof height === "number" ? `${height}px` : height;
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-[var(--color-line)]/60 ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-5">
      <Skeleton width={120} height={12} />
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} width={`${100 - i * 10}%`} height={14} />
        ))}
      </div>
    </div>
  );
}
