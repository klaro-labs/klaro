"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";

const ITEMS = [
  { label: "Queues", href: "/admin" as const },
  { label: "Manual review", href: "/admin/manual-review" as const },
  { label: "Risk holds", href: "/admin/risk-holds" as const },
  { label: "Cases", href: "/admin/case-management" as const },
  { label: "Disputes", href: "/admin/disputes" as const },
  { label: "Sanctions", href: "/admin/sanctions" as const },
  { label: "Limits", href: "/admin/limits" as const },
  { label: "Audit log", href: "/admin/audit-log" as const },
] as const;

export function AdminNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="Admin"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6"
      >
        <Link
          href="/admin"
          aria-label="Klaro admin"
          className="shrink-0 flex items-center gap-2"
        >
          <Logo />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Admin
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
          <span className="hidden text-xs text-[var(--color-ink-muted)] md:inline">
            Operator
          </span>
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-xs font-medium text-white"
          >
            OP
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
        <ul className="border-t border-[var(--color-line)] bg-white px-6 py-4 md:hidden">
          {ITEMS.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="block py-2 text-sm text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
