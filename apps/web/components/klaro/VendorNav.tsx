"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";

/**
 * VendorNav — internal nav for /vendor/*. Distinct from the marketing Nav
 * (no Product/Pricing/Company links — those would distract). Vendor-side
 * surfaces share this top bar.
 * P1 (#92): nav was `hidden md:flex` with no fallback
 * — mobile users had no way to navigate. Hamburger panel added.
 */
const ITEMS = [
  { label: "Overview", href: "/vendor" as const },
  { label: "Invoices", href: "/vendor/invoices/new" as const },
  { label: "Recurring", href: "/vendor/invoices/recurring" as const },
  { label: "Bulk import", href: "/vendor/invoices/import" as const },
  { label: "Bills", href: "/vendor/bills" as const },
  { label: "Cashout", href: "/vendor/cashout" as const },
  { label: "Transit", href: "/vendor/transit" as const },
  { label: "Retainer", href: "/vendor/retainer" as const },
  { label: "Financing", href: "/vendor/financing" as const },
  { label: "Webhooks", href: "/vendor/integrations/webhooks" as const },
  { label: "ERP", href: "/vendor/integrations/erp" as const },
  { label: "Disputes", href: "/vendor/disputes" as const },
  { label: "Agents", href: "/vendor/agents" as const },
  { label: "Reputation", href: "/vendor/reputation" as const },
  { label: "Exports", href: "/vendor/exports" as const },
  { label: "Settings", href: "/vendor/settings" as const },
  { label: "Team", href: "/vendor/team" as const },
  { label: "Delegations", href: "/vendor/delegations" as const },
] as const;

export function VendorNav({ vendorName }: { vendorName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="Vendor"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6"
      >
        <Link
          href="/vendor"
          aria-label="Klaro vendor home"
          className="shrink-0"
        >
          <Logo />
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
            {vendorName}
          </span>
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-xs font-medium text-white"
          >
            {vendorName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
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
