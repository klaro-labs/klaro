"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";

const ITEMS = [
  { label: "Overview", href: "/lp" as const },
  { label: "Dashboard", href: "/lp/dashboard" as const },
  { label: "Queue", href: "/lp/queue" as const },
  { label: "Reputation", href: "/lp/reputation" as const },
  { label: "Disputes", href: "/lp/disputes" as const },
  { label: "Settings", href: "/lp/settings" as const },
] as const;

export function LPNav({ entityName }: { entityName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="LP"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6"
      >
        <Link href="/lp" aria-label="Klaro LP home" className="shrink-0 flex items-center gap-2">
          <Logo />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            LP
          </span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <span className="hidden max-w-[120px] truncate text-xs text-[var(--color-ink-muted)] md:inline">
            {entityName}
          </span>
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-klaro-orange-deep)] text-xs font-medium text-white"
          >
            {entityName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
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
