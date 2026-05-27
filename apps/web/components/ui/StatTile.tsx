import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6",
        className,
      )}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-sm text-[var(--color-muted)]">{sub}</p>
      )}
    </div>
  );
}
