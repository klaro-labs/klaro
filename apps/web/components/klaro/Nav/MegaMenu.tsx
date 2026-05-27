"use client";

import { useState, useRef, useCallback } from "react";
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

export function MegaMenuTrigger({
  group,
  children,
}: {
  group: NavGroup;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }, []);

  const leave = useCallback(() => {
    timer.current = setTimeout(() => setOpen(false), 150);
  }, []);

  if (!group.items) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {children}
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-3 w-[420px] -translate-x-1/2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-4 shadow-[0_8px_30px_rgba(10,10,10,0.08)]"
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          <div className="grid gap-1">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                role="menuitem"
                className="rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-warm)]"
                onClick={() => setOpen(false)}
              >
                <div className="text-sm font-medium text-[var(--color-ink)]">
                  {item.label}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {item.desc}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
