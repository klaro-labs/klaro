import { cn } from "@/lib/cn";

export function MockBrowserChrome({
  url,
  children,
  className,
}: {
  url?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--color-line)] shadow-[0_4px_16px_rgba(10,10,10,0.06)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-bg-warm)] px-4 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-[var(--color-line)]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[var(--color-line)]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[var(--color-line)]" />
        {url && (
          <span className="ml-3 font-mono text-[11px] text-[var(--color-muted)]">
            {url}
          </span>
        )}
      </div>
      <div className="bg-[var(--color-bg)]">{children}</div>
    </div>
  );
}
