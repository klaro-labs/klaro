import Link from "next/link";

/**
 * Mobile PWA app shell — wraps any vendor route content with a bottom nav.
 * Used inside `md:hidden` blocks per page so the desktop layout stays untouched.
 * Matches the bottom-nav in designer/mobile/index.html (Home · Invoices · Cashout · Profile).
 */
export function MobileShell({
  active,
  children,
}: {
  active: "home" | "invoices" | "cashout" | "profile";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <div className="flex-1 px-4 pt-5 pb-24">{children}</div>
      <BottomNav active={active} />
    </div>
  );
}

function BottomNav({
  active,
}: {
  active: "home" | "invoices" | "cashout" | "profile";
}) {
  const items: {
    key: "home" | "invoices" | "cashout" | "profile";
    label: string;
    href:
      | "/vendor"
      | "/vendor/invoices"
      | "/vendor/cashout"
      | "/vendor/settings";
    icon: string;
  }[] = [
    { key: "home", label: "Home", href: "/vendor", icon: "⌂" },
    { key: "invoices", label: "Invoices", href: "/vendor/invoices", icon: "▤" },
    { key: "cashout", label: "Cashout", href: "/vendor/cashout", icon: "↗" },
    { key: "profile", label: "Profile", href: "/vendor/settings", icon: "◉" },
  ];
  return (
    <nav
      aria-label="Mobile vendor"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-white/95 px-2 pt-2 pb-6 backdrop-blur"
    >
      <ul className="grid grid-cols-4 gap-1">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-[10px] font-medium ${
                  isActive
                    ? "text-[var(--color-brand)]"
                    : "text-[var(--color-ink-subtle)]"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {it.icon}
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
