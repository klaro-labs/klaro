import Link from "next/link";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div className="max-w-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            404
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            We couldn&apos;t find that page.
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            The link might be stale, or the resource was moved. Try the vendor
            dashboard or the marketing site.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/vendor"
              className="rounded-pill bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Vendor dashboard
            </Link>
            <Link
              href="/"
              className="rounded-pill border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
