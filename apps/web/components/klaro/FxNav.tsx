"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";

const ITEMS = [
  { label: "Quote", href: "/fx" as const },
  { label: "Klaro home →", href: "/" as const },
] as const;

export function FxNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="FX"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6"
      >
        <Link href="/fx" aria-label="Klaro FX home" className="shrink-0 flex items-center gap-2">
          <Logo />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            FX
          </span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[var(--color-ink-subtle)] md:inline">
            Stablecoin FX on Arc
          </span>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-[var(--color-line)] md:hidden"
          >
            <span aria-hidden className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden">
          <ul className="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-3">
            {ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
