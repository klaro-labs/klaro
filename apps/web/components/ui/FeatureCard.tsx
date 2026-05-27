import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function FeatureCard({
  title,
  href,
  children,
  className,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <h3 className="font-display text-lg font-semibold tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        {children}
      </p>
      {href && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-klaro-orange)]">
          Learn more <ArrowRight className="size-3.5" />
        </span>
      )}
    </>
  );

  const base = cn(
    "rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-[var(--klaro-tile-pad)] transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
    className,
  );

  if (href) {
    return (
      <Link href={href as Route} className={cn(base, "block")}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}
