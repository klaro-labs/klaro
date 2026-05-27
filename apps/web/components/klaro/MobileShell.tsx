import Link from "next/link";
import { Home, Receipt, ArrowUpRight, User } from "lucide-react";

/**
 * Mobile PWA app shell — wraps any vendor route content with a bottom nav.
 * Used inside `md:hidden` blocks per page so the desktop layout stays untouched.
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
  const items = [
    { key: "home" as const, label: "Home", href: "/vendor" as const, Icon: Home },
    { key: "invoices" as const, label: "Invoices", href: "/vendor/invoices" as const, Icon: Receipt },
    { key: "cashout" as const, label: "Cashout", href: "/vendor/cashout" as const, Icon: ArrowUpRight },
    { key: "profile" as const, label: "Profile", href: "/vendor/settings" as const, Icon: User },
  ];
  return (
    <nav
      aria-label="Mobile vendor"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-[var(--color-bg)]/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur"
    >
      <ul className="grid grid-cols-4 gap-1">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-3 text-[11px] font-medium ${
                  isActive
                    ? "text-[var(--color-brand)]"
                    : "text-[var(--color-ink-subtle)]"
                }`}
              >
                <it.Icon aria-hidden className="size-5" strokeWidth={1.75} />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
