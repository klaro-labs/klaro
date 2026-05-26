import Link from "next/link";
import { Logo } from "./Logo";

export function FxNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/fx" className="shrink-0 flex items-center gap-2">
          <Logo />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            FX
          </span>
        </Link>
        <ul className="hidden items-center gap-6 md:flex">
          <li>
            <Link
              href="/fx"
              className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Quote
            </Link>
          </li>
          <li>
            <Link
              href="/"
              className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Klaro home →
            </Link>
          </li>
        </ul>
        <span className="text-xs text-[var(--color-ink-subtle)]">
          Stablecoin FX on Arc
        </span>
      </nav>
    </header>
  );
}
