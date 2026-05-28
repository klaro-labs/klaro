"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Logo } from "./Logo";
import { CommandPalette, openCommandPalette } from "./CommandPalette";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: ReactNode;
  badge?: number;
};

export type AppShellProps = {
  children: ReactNode;
  vendorName: string;
  vendorSubtitle: string;
  initials: string;
  notifCount: number;
  pendingInvoiceCount: number;
};

/**
 * Vendor app shell — desktop sidebar + topbar + content; mobile bottom tabs +
 * FAB + bottom-sheet "More". Replaces the legacy VendorNav + MobileShell pair.
 * Counts and vendor identity come from the parent layout (server) — never
 * synthesized client-side. ⌘K palette is mounted at root.
 */
export function AppShell({
  children,
  vendorName,
  vendorSubtitle,
  initials,
  notifCount,
  pendingInvoiceCount,
}: AppShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/vendor"
      ? pathname === "/vendor" || pathname === "/vendor/"
      : pathname === href || pathname.startsWith(href + "/");

  const sideItems: NavItem[] = [
    { href: "/vendor", label: "Dashboard", short: "Home", icon: <IconHome /> },
    {
      href: "/vendor/invoices",
      label: "Invoices",
      short: "Invoices",
      icon: <IconInvoice />,
      badge: pendingInvoiceCount,
    },
    {
      href: "/vendor/cashout",
      label: "Cashout",
      short: "Cashout",
      icon: <IconBank />,
    },
    {
      href: "/vendor/disputes",
      label: "Disputes",
      short: "Disputes",
      icon: <IconShield />,
    },
    {
      href: "/vendor/reputation",
      label: "Reputation",
      short: "Score",
      icon: <IconStar />,
    },
    { href: "/vendor/team", label: "Team", short: "Team", icon: <IconUsers /> },
    {
      href: "/vendor/settings",
      label: "Settings",
      short: "Settings",
      icon: <IconCog />,
    },
  ];

  const tabItems: NavItem[] = [
    { href: "/vendor", label: "Home", short: "Home", icon: <IconHome /> },
    {
      href: "/vendor/invoices",
      label: "Invoices",
      short: "Invoices",
      icon: <IconInvoice />,
      badge: pendingInvoiceCount,
    },
    {
      href: "/vendor/cashout",
      label: "Cashout",
      short: "Cashout",
      icon: <IconBank />,
    },
    {
      href: "/vendor/reputation",
      label: "Score",
      short: "Score",
      icon: <IconStar />,
    },
  ];

  const moreItems: NavItem[] = [
    {
      href: "/vendor/disputes",
      label: "Disputes",
      short: "Disputes",
      icon: <IconShield />,
    },
    { href: "/vendor/team", label: "Team", short: "Team", icon: <IconUsers /> },
    {
      href: "/vendor/settings",
      label: "Settings",
      short: "Settings",
      icon: <IconCog />,
    },
  ];
  const isMoreActive = moreItems.some((m) => isActive(m.href));

  const fabOn = isActive("/vendor") || isActive("/vendor/invoices");

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)] md:grid md:grid-cols-[240px_1fr]">
      {/* ─── Desktop sidebar ─── */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-5 md:flex">
        <Link
          href="/vendor"
          aria-label="Klaro home"
          className="mb-4 px-3 py-1"
        >
          <Logo />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {sideItems.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href as Route}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--color-bg-elevated)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-ink)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-sm bg-[var(--color-brand)] transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="inline-flex w-[18px] justify-center">
                  {it.icon}
                </span>
                <span className="flex-1">{it.label}</span>
                {it.badge && it.badge > 0 ? (
                  <span className="rounded-pill bg-[var(--color-brand-soft)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-brand)]">
                    {it.badge > 99 ? "99+" : it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[var(--color-line)] pt-3">
          <div className="flex items-center gap-3 px-2">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full bg-[var(--color-brand)]/15 font-mono text-[11px] font-semibold text-[var(--color-brand)]"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                {vendorName}
              </p>
              <p className="truncate text-[11px] text-[var(--color-ink-subtle)]">
                {vendorSubtitle}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Mobile top bar ─── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/vendor" aria-label="Klaro home" className="shrink-0">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-ink)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Link
            href="/vendor/disputes"
            aria-label={`Notifications (${notifCount})`}
            className="relative inline-flex size-9 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-ink)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M10 19a2 2 0 004 0"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            {notifCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--color-brand)]"
              />
            ) : null}
          </Link>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="min-w-0 pb-24 md:pb-0">
        {/* Desktop topbar */}
        <div className="sticky top-0 z-30 hidden h-16 items-center justify-end gap-2 border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 px-6 backdrop-blur md:flex">
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex items-center gap-3 rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-line-2)] hover:text-[var(--color-ink)]"
          >
            <span>Search…</span>
            <kbd className="rounded border border-[var(--color-line)] bg-white px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/vendor/disputes"
            aria-label={`Notifications (${notifCount})`}
            className="relative inline-flex size-9 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M10 19a2 2 0 004 0"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            {notifCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--color-brand)]"
              />
            ) : null}
          </Link>
          <Link
            href="/vendor/invoices/new"
            className="inline-flex items-center gap-1.5 rounded-pill bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)]"
          >
            + New invoice
          </Link>
        </div>
        {children}
      </main>

      {/* ─── Mobile FAB ─── */}
      {fabOn ? (
        <Link
          href="/vendor/invoices/new"
          aria-label="New invoice"
          className="fixed bottom-20 right-5 z-40 grid size-14 place-items-center rounded-full bg-[var(--color-ink)] text-white shadow-lg hover:bg-black md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      ) : null}

      {/* ─── Mobile bottom tabs ─── */}
      <nav
        aria-label="Mobile vendor"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--color-line)] bg-[var(--color-bg)]/95 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 backdrop-blur md:hidden"
      >
        {tabItems.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href as Route}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active
                  ? "text-[var(--color-brand)]"
                  : "text-[var(--color-ink-subtle)]"
              }`}
            >
              {it.icon}
              <span>{it.short}</span>
              {it.badge && it.badge > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-[26%] top-1 size-1.5 rounded-full bg-[var(--color-brand)]"
                />
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          aria-expanded={moreOpen}
          className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            isMoreActive
              ? "text-[var(--color-brand)]"
              : "text-[var(--color-ink-subtle)]"
          }`}
        >
          <IconMore />
          <span>More</span>
        </button>
      </nav>

      {/* ─── Mobile More bottom sheet ─── */}
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More"
          className="fixed inset-0 z-50 md:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-[var(--color-line)] bg-white p-5 pb-[max(env(safe-area-inset-bottom),16px)]">
            <div
              aria-hidden
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-line-2)]"
            />
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-semibold tracking-tight">
                More
              </p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-elevated)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-3">
              {moreItems.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href as Route}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4 text-xs font-medium hover:border-[var(--color-line-2)]"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-white text-[var(--color-ink-muted)]">
                      {it.icon}
                    </span>
                    <span>{it.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-3 border-t border-[var(--color-line)] pt-4">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full bg-[var(--color-brand)]/15 font-mono text-[11px] font-semibold text-[var(--color-brand)]"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{vendorName}</p>
                <p className="truncate text-[11px] text-[var(--color-ink-subtle)]">
                  {vendorSubtitle}
                </p>
              </div>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <CommandPalette />
    </div>
  );
}

/* ─── Icons ─── */
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1v-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconInvoice() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h9l4 4v14H6V3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 11h7M9 15h5M9 7h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconBank() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10l9-5 9 5M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l2.7 5.6 6.1.7-4.6 4.3 1.2 6.1L12 16.9 6.6 19.7l1.2-6.1L3.2 9.3l6.1-.7L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M15 20c0-2.5 1.8-4.4 4-4.4s4 1.9 4 4.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
function IconCog() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9 1.65 1.65 0 004.27 7.18l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6 1.65 1.65 0 0010 3.09V3a2 2 0 114 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.13.3.2.63.2.97s-.07.67-.2.97z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconMore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
