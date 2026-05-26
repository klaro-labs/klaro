"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error] route boundary caught:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <div className="max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Something broke
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          We hit an unexpected error.
        </h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          The team has been notified. You can retry the action or head back to
          your dashboard.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-[var(--color-ink-subtle)]">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-pill bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-pill border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
