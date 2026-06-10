import Link from "next/link";
import type { Route } from "next";
import { Pill } from "@/components/ui/Pill";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface CTA {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export function PageHero({
  eyebrow,
  chips,
  title,
  sub,
  ctas,
}: {
  eyebrow: string;
  chips?: string[];
  title: string;
  sub: string;
  ctas?: CTA[];
}) {
  return (
    <section className="klaro-container pt-24 pb-16 md:pt-32 md:pb-20">
      <div className="max-w-3xl">
        {chips && chips.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <Pill key={c} tone="warm" size="sm" dot="warm">
                {c}
              </Pill>
            ))}
          </div>
        )}
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange-deep)]">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-muted)]">
          {sub}
        </p>
        {ctas && ctas.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-3">
            {ctas.map((cta) => (
              <Link
                key={cta.label}
                href={cta.href as Route}
                className={cn(
                  buttonVariants({ size: "lg", variant: cta.variant ?? "primary" }),
                )}
              >
                {cta.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
