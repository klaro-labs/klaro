import Link from "next/link";
import { Logo } from "./Logo";

/**
 * Footer — designer §17 sitemap, rewritten to remove the
 * aliasing pattern. Previously 5-of-6 rows in each column linked to a
 * single catch-all page (e.g. every Trust row → /trust), so clicking
 * "Bug bounty" landed on a generic Trust page with no bug-bounty
 * content. That violates (no overclaiming). The honest
 * fix is one row per real destination; labels match what the linked
 * page actually shows. Sub-routes earn their own label only once they
 * have their own page.
 */

const LINKS = {
  Product: [
    { label: "Product overview", href: "/product" as const },
    { label: "Pricing", href: "/pricing" as const },
  ],
  Developers: [
    { label: "Developer docs", href: "/developers" as const },
    { label: "Documentation hub", href: "/docs" as const },
    { label: "Status", href: "/status" as const },
  ],
  Company: [
    { label: "About Klaro", href: "/company" as const },
    { label: "Roadmap", href: "/roadmap" as const },
    { label: "Brand kit", href: "/brand-kit" as const },
  ],
  Trust: [
    { label: "Trust center", href: "/trust" as const },
    { label: "Help center", href: "/help" as const },
    { label: "Privacy", href: "/legal/privacy" as const },
    { label: "Disclosures", href: "/legal/disclosures" as const },
  ],
} as const;

export function Footer() {
  return (
    <footer className="mt-32 bg-[var(--color-ink)] text-white">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="mb-4 text-white">
              <Logo size={28} />
            </div>
            <p className="max-w-xs text-sm text-white/60">
              Arc-native payment OS for emerging-market vendors. Invoice
              globally. Cash out locally. Prove every payment.
            </p>
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
                      href={item.href}
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
          <p>
            © 2026 Klaro Labs Inc. · Testnet preview · Klaro is not a bank · No
            real money moves on testnet
          </p>
          <div className="md:shrink-0">
            <Link href="/" className="font-mono text-white/60 hover:text-white">
              klaro.me
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
