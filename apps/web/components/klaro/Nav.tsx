"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { buttonVariants } from "@/components/ui/Button";
// LocaleSwitcher moved to Footer 2026-05-25 — designer's landing nav has no
// language control. Footer is the standard placement and preserves the i18n
// feature without polluting the nav with a native <select>.

/**
 * Top nav — kept minimal per Stripe/Mercury pattern.
 * 5 nav items + sign-in + primary CTA. Each item is a route, not a dropdown,
 * so first paint stays cheap. Dropdowns come back later if/when needed.
 * P1 (#92): hamburger panel for mobile.
 */
const NAV_ITEMS = [
  { label: "Product", href: "/product" as const },
  { label: "Developers", href: "/developers" as const },
  { label: "Pricing", href: "/pricing" as const },
  { label: "Company", href: "/company" as const },
  { label: "Roadmap", href: "/roadmap" as const },
  { label: "Trust", href: "/trust" as const },
] as const;

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-[1216px] items-center justify-between px-6"
      >
        <Link href="/" aria-label="Klaro home" className="shrink-0">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className={`hidden md:inline-flex ${buttonVariants({ size: "sm", variant: "secondary" })}`}
          >
            Sign in
          </Link>
          <Link href="/signin" className={buttonVariants({ size: "sm" })}>
            Open klaro →
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-[var(--color-line)] md:hidden"
          >
            <span aria-hidden className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-current"></span>
              <span className="block h-0.5 w-4 bg-current"></span>
              <span className="block h-0.5 w-4 bg-current"></span>
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden">
          <ul className="border-t border-[var(--color-line)] bg-white px-6 py-3">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className="block py-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
