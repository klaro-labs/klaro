"use client";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <Eyebrow>Admin · error</Eyebrow>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        Couldn&apos;t load that.
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
        {error.message}
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/admin" className={buttonVariants({ variant: "secondary" })}>
          Admin home
        </Link>
      </div>
    </main>
  );
}
