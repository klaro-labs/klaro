import Link from "next/link";
import type { Route } from "next";
import { Logo } from "./Logo";

/**
 * Footer — one row per real destination; labels match what each linked page
 * actually shows. Email row mirrors §5.4 of the port plan.
 */

const LINKS = {
  Product: [
    { label: "Product overview", href: "/product" as const },
    { label: "Invoicing", href: "/product/invoicing" as const },
    { label: "Receipts", href: "/product/receipts" as const },
    { label: "Cashout", href: "/product/cashout" as const },
    { label: "Pricing", href: "/pricing" as const },
  ],
  Build: [
    { label: "Build with Klaro", href: "/build" as const },
    { label: "API reference", href: "/docs" as const },
    { label: "Status", href: "/status" as const },
  ],
  Resources: [
    { label: "Docs", href: "/docs" as const },
    { label: "User flows", href: "/resources/flows" as const },
    { label: "Brand kit", href: "/brand-kit" as const },
    { label: "Trust center", href: "/trust" as const },
    { label: "Roadmap", href: "/roadmap" as const },
  ],
  Company: [
    { label: "About Klaro", href: "/company" as const },
    { label: "Contact", href: "/company/contact" as const },
    { label: "Privacy", href: "/legal/privacy" as const },
    { label: "Disclosures", href: "/legal/disclosures" as const },
  ],
} as const;

const EMAILS = [
  { label: "General", value: "hi@klaro.so" },
  { label: "Sales", value: "sales@klaro.so" },
  { label: "Security", value: "security@klaro.so" },
] as const;

export function Footer() {
  return (
    <footer className="bg-[var(--color-ink)] text-white">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="mb-4 text-white">
              <Logo size={28} tone="dark" />
            </div>
            <p className="max-w-xs text-sm text-white/60">
              Arc-native payment OS for emerging-market vendors. Invoice
              globally. Cash out locally. Prove every payment.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {EMAILS.map((e) => (
                <li key={e.value} className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                    {e.label}
                  </span>
                  <a
                    href={`mailto:${e.value}`}
                    className="text-white/80 transition-colors hover:text-white"
                  >
                    {e.value}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {Object.entries(LINKS).map(([heading, items]) => (
            <div key={heading}>
              <h4 className="text-[11px] font-medium tracking-[0.18em] uppercase text-white/50">
                {heading}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href as Route}
                      className="text-sm text-white/80 transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <div>
            <p>
              © 2026 Klaro Labs · Testnet preview · Klaro is not a bank · No
              real money moves on testnet
            </p>
            <p className="mt-1 text-white/35">
              Klaro is not a bank, broker-dealer, or money transmitter. Klaro provides software; partner payout services are operated by licensed partners in each corridor.
            </p>
          </div>
          <div className="md:shrink-0">
            <Link href="/" className="font-mono text-white/60 hover:text-white">
              klaro.so
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
