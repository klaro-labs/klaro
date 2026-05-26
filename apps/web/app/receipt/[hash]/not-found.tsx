import Link from "next/link";
export default function ReceiptNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        Receipt · 404
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        No receipt at that hash.
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
        Check the receipt link and refresh. In live-contract mode, an anchored
        receipt appears after verified settlement; simulator receipts appear
        only after a completed demo checkout.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Klaro home
      </Link>
    </main>
  );
}
