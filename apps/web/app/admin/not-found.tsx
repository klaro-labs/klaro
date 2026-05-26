import Link from "next/link";
export default function AdminNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        Admin · 404
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        No such queue.
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
        Try the queues home or pick a specific admin surface from the nav.
      </p>
      <Link
        href="/admin"
        className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Admin home
      </Link>
    </main>
  );
}
