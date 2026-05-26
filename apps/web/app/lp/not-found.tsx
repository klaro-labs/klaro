import Link from "next/link";
export default function LpNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        Not in your LP scope.
      </h1>
      <Link
        href="/lp"
        className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        LP home
      </Link>
    </main>
  );
}
