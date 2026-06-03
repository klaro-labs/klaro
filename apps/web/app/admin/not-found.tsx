import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";
export default function AdminNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <Eyebrow>Admin · 404</Eyebrow>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        No such queue.
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
        Try the queues home or pick a specific admin surface from the nav.
      </p>
      <Link href="/admin" className={cn("mt-6", buttonVariants())}>
        Admin home
      </Link>
    </main>
  );
}
