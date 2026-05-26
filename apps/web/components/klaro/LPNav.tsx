import Link from "next/link";
import { Logo } from "./Logo";

const ITEMS = [
  { label: "Overview", href: "/lp" as const },
  { label: "Dashboard", href: "/lp/dashboard" as const },
  { label: "Queue", href: "/lp/queue" as const },
  { label: "Reputation", href: "/lp/reputation" as const },
  { label: "Disputes", href: "/lp/disputes" as const },
  { label: "Settings", href: "/lp/settings" as const },
] as const;

export function LPNav({ entityName }: { entityName: string }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_92%,transparent)] backdrop-blur">
      <nav
        aria-label="LP"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6"
      >
        <Link
          href="/lp"
          aria-label="Klaro LP home"
          className="shrink-0 flex items-center gap-2"
        >
          <Logo />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            LP
          </span>
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
            {entityName}
          </span>
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-medium text-white"
          >
            {entityName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
        </div>
      </nav>
    </header>
  );
}
