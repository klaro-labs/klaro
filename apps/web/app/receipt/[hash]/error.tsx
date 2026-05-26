"use client";
import Link from "next/link";
export default function ReceiptError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        Receipt unavailable
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        We couldn&apos;t load this receipt.
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
        {error.message}
      </p>
      <div className="mt-8 flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium hover:border-[var(--color-ink)]/40"
        >
          Klaro home
        </Link>
      </div>
    </main>
  );
}
