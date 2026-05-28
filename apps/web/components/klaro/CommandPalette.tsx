"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: "Go" | "Create";
};

const COMMANDS: Cmd[] = [
  { id: "go-home", label: "Dashboard", href: "/vendor", group: "Go" },
  { id: "go-invoices", label: "Invoices", href: "/vendor/invoices", group: "Go" },
  { id: "go-cashout", label: "Cashout", href: "/vendor/cashout", group: "Go" },
  { id: "go-disputes", label: "Disputes", href: "/vendor/disputes", group: "Go" },
  { id: "go-reputation", label: "Reputation", href: "/vendor/reputation", group: "Go" },
  { id: "go-team", label: "Team", href: "/vendor/team", group: "Go" },
  { id: "go-settings", label: "Settings", href: "/vendor/settings", group: "Go" },
  {
    id: "new-invoice",
    label: "New invoice",
    hint: "Create a USDC invoice",
    href: "/vendor/invoices/new",
    group: "Create",
  },
  {
    id: "new-cashout",
    label: "New cashout",
    hint: "Request INR payout",
    href: "/vendor/cashout?new=1",
    group: "Create",
  },
  {
    id: "new-dispute",
    label: "Open dispute",
    hint: "Escalate a stuck payment",
    href: "/vendor/disputes",
    group: "Create",
  },
];

/**
 * ⌘K command palette — keyboard-driven jump-to-page + quick-create.
 * Listens to ⌘K / Ctrl+K globally; ESC closes; arrow keys move selection;
 * Enter navigates. No mock entries — every command resolves to a real route.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q) ||
        c.id.includes(q),
    );
  }, [query]);

  const run = useCallback(
    (cmd: Cmd) => {
      setOpen(false);
      router.push(cmd.href as Route);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      run(results[active]);
    }
  }

  if (!open) return null;

  const grouped = results.reduce<Record<string, Cmd[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});
  let idx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-[18vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="text-[var(--color-ink-subtle)]"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to page or action…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-subtle)]"
          />
          <kbd className="rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-subtle)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-ink-subtle)]">
              No matches.
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="py-2">
                <p className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                  {group}
                </p>
                {items.map((c) => {
                  idx += 1;
                  const isActive = idx === active;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => run(c)}
                      onMouseEnter={() => setActive(idx)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                        isActive
                          ? "bg-[var(--color-bg-elevated)] text-[var(--color-ink)]"
                          : "text-[var(--color-ink)]"
                      }`}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{c.label}</span>
                        {c.hint ? (
                          <span className="text-xs text-[var(--color-ink-subtle)]">
                            {c.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                        {c.href}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 py-2 text-[10px] text-[var(--color-ink-subtle)]">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono">
              ↑↓
            </kbd>
            move
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono">
              ↵
            </kbd>
            select
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

/** Imperative trigger — call from a button onClick to open the palette. */
export function openCommandPalette() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );
}
