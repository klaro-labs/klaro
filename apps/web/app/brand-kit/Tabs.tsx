"use client";

import { useState, useEffect, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Sticky horizontal tab bar — used by the brand-kit page to split the
 * five sections into digestible mobile-friendly chunks. Sync's the
 * active tab to the URL hash so deep-links work (`/brand-kit#color`).
 */
export function BrandKitTabs({ tabs }: { tabs: Tab[] }) {
  const groupId = useId();
  const [active, setActive] = useState<string>(tabs[0]!.id);

  // Read initial hash + listen for hashchange.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash && tabs.some((t) => t.id === fromHash)) {
      setActive(fromHash);
    }
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && tabs.some((t) => t.id === h)) setActive(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [tabs]);

  const onClick = (id: string) => {
    setActive(id);
    if (typeof window !== "undefined") {
      // Update hash without scrolling.
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${id}`);
    }
  };

  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6">
      <div className="sticky top-[64px] z-30 -mx-6 border-y border-[var(--color-line)] bg-[var(--color-bg)]/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/80">
        <div
          role="tablist"
          aria-label="Brand kit sections"
          className="flex gap-1 overflow-x-auto py-2"
        >
          {tabs.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`${groupId}-tab-${t.id}`}
                aria-selected={isActive}
                aria-controls={`${groupId}-panel-${t.id}`}
                onClick={() => onClick(t.id)}
                className={cn(
                  "shrink-0 rounded-pill px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                  isActive
                    ? "bg-[var(--color-ink)] text-white"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-ink)]",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${groupId}-panel-${t.id}`}
          aria-labelledby={`${groupId}-tab-${t.id}`}
          hidden={t.id !== current.id}
          className="py-12 md:py-16"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
