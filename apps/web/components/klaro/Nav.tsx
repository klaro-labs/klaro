"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Logo } from "./Logo";
import { buttonVariants } from "@/components/ui/Button";
import { MegaMenuTrigger, type NavGroup } from "./Nav/MegaMenu";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Product",
    href: "/product",
    items: [
      { label: "Invoicing", href: "/product/invoicing", desc: "Global USDC invoices with quote freeze." },
      { label: "Receipts", href: "/product/receipts", desc: "On-chain proof of every payment." },
      { label: "Cashout", href: "/product/cashout", desc: "USDC to local currency via LPs." },
      { label: "StableFX", href: "/product/stablefx", desc: "Cross-chain stablecoin routing." },
      { label: "Reputation", href: "/product/reputation", desc: "On-chain financing-readiness signal." },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  { label: "Build", href: "/build" },
  {
    label: "Resources",
    href: "/resources",
    items: [
      { label: "Docs", href: "/docs", desc: "API reference and guides." },
      { label: "User flows", href: "/resources/flows", desc: "End-to-end journey diagrams." },
      { label: "Brand kit", href: "/brand-kit", desc: "Logo, palette, voice, motion." },
      { label: "Trust center", href: "/trust", desc: "11 promises we prove." },
    ],
  },
  { label: "Company", href: "/company" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-[clamp(20px,4vw,56px)]"
      >
        <Link href="/" aria-label="Klaro home" className="shrink-0">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_GROUPS.map((g) => (
            <li key={g.label}>
              <MegaMenuTrigger group={g}>
                <Link
                  href={g.href as Route}
                  className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  {g.label}
                  {g.items && (
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="opacity-50">
                      <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </Link>
              </MegaMenuTrigger>
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
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden">
          <div className="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-4">
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="py-2">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {g.label}
                </p>
                {g.items ? (
                  <div className="mt-1">
                    {g.items.map((it) => (
                      <Link
                        key={it.href}
                        href={it.href as Route}
                        onClick={() => setOpen(false)}
                        className="block py-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                      >
                        {it.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    href={g.href as Route}
                    onClick={() => setOpen(false)}
                    className="block py-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  >
                    {g.label}
                  </Link>
                )}
              </div>
            ))}
            <div className="mt-4 flex gap-2">
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className={`flex-1 justify-center ${buttonVariants({ size: "sm", variant: "secondary" })}`}
              >
                Sign in
              </Link>
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className={`flex-1 justify-center ${buttonVariants({ size: "sm" })}`}
              >
                Open klaro
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
