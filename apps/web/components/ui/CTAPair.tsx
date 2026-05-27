import Link from "next/link";
import type { Route } from "next";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function CTAPair({
  primary,
  ghost,
}: {
  primary: { label: string; href: string };
  ghost: { label: string; href: string };
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href={primary.href as Route} className={buttonVariants({ size: "lg" })}>
        {primary.label}
      </Link>
      <Link
        href={ghost.href as Route}
        className={cn(buttonVariants({ size: "lg", variant: "secondary" }))}
      >
        {ghost.label}
      </Link>
    </div>
  );
}
