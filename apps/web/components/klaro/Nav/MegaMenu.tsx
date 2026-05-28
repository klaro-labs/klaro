"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";

export interface MegaMenuItem {
  label: string;
  href: string;
  desc: string;
}

export interface NavGroup {
  label: string;
  href: string;
  items?: MegaMenuItem[];
}

/**
 * Hover-mega-menu with 140ms delay-out so cursor can cross the gap. Closes on
 * Esc or outside click.
 */
export function MegaMenuTrigger({
  group,
  children,
}: {
  group: NavGroup;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const enter = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }, []);

  const leave = useCallback(() => {
    timer.current = setTimeout(() => setOpen(false), 140);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!group.items) {
    return <>{children}</>;
  }

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      {children}
      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={`${group.label} menu`}
          className="absolute left-1/2 top-full z-50 mt-3 w-[440px] -translate-x-1/2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3 shadow-[0_12px_40px_rgba(10,10,10,0.10)]"
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          <div className="grid gap-0.5">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                role="menuitem"
                aria-label={`${item.label} — ${item.desc}`}
                className="group rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-warm)] focus-visible:bg-[var(--color-bg-warm)] focus-visible:outline-none"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-ink)]">
                    {item.label}
                  </span>
                  <span
                    aria-hidden
                    className="translate-x-0 text-[var(--color-ink-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-brand)]"
                  >
                    →
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
