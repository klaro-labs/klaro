"use client";

import Link from "next/link";
import { Logo } from "@/components/klaro/Logo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-paper)] px-6 text-center text-[var(--color-ink)]">
      <Logo size={28} />
      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="mt-4 max-w-md text-sm text-[var(--color-ink-muted)]">
        The page you opened isn&apos;t cached and we can&apos;t reach the
        network. Klaro keeps the most-visited screens available offline so
        vendors can still draft invoices and review balances on the move.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => location.reload()}
          className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium hover:border-[var(--color-ink)]/40"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
