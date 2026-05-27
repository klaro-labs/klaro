"use client";

import Link from "next/link";

export default function DisputeDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <div className="max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Error
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Something went wrong.
        </h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          We couldn&apos;t load this dispute. Try again or go back.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-pill bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Try again
          </button>
          <Link
            href="/vendor/disputes"
            className="rounded-pill border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
          >
            ← All disputes
          </Link>
        </div>
      </div>
    </main>
  );
}
