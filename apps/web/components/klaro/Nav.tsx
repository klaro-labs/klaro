"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
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

  // Lock body scroll under the mobile sheet (iOS rubber-band fix).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
                  {g.items ? (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      aria-hidden
                      className="opacity-50"
                    >
                      <path
                        d="M3 5l3 3 3-3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
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
          <Link
            href="/signin"
            className={`hidden md:inline-flex ${buttonVariants({ size: "sm" })}`}
          >
            Open klaro →
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav-sheet"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-line)] text-[var(--color-ink)] md:hidden"
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {open ? (
        <div
          id="mobile-nav-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col bg-[var(--color-bg)] md:hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
            {NAV_GROUPS.map((g) => (
              <section
                key={g.label}
                className="border-b border-[var(--color-line)] py-3 last:border-b-0"
              >
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-brand)]">
                  {g.label}
                </p>
                {g.items ? (
                  <ul className="mt-2 flex flex-col">
                    {g.items.map((it) => (
                      <li key={it.href}>
                        <Link
                          href={it.href as Route}
                          onClick={() => setOpen(false)}
                          className="-mx-2 flex min-h-[56px] flex-col justify-center rounded-md px-2 py-2 active:bg-[var(--color-bg-warm)]"
                        >
                          <span className="text-base font-medium text-[var(--color-ink)]">
                            {it.label}
                          </span>
                          <span className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {it.desc}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Link
                    href={g.href as Route}
                    onClick={() => setOpen(false)}
                    className="-mx-2 mt-2 flex min-h-[56px] items-center rounded-md px-2 text-base font-medium text-[var(--color-ink)] active:bg-[var(--color-bg-warm)]"
                  >
                    {g.label}
                  </Link>
                )}
              </section>
            ))}
          </div>
          <div className="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-6 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="flex gap-3">
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className={`flex-1 justify-center ${buttonVariants({ size: "lg", variant: "secondary" })}`}
              >
                Sign in
              </Link>
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className={`flex-1 justify-center ${buttonVariants({ size: "lg" })}`}
              >
                Open klaro
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
