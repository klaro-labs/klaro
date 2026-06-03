import Link from "next/link";
import type { Route } from "next";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

const LEGAL: { label: string; href: Route }[] = [
  { label: "Terms", href: "/legal/terms" as Route },
  { label: "Privacy", href: "/legal/privacy" as Route },
  { label: "DPA", href: "/legal/dpa" as Route },
  { label: "Subprocessors", href: "/legal/subprocessors" as Route },
  { label: "Cookies", href: "/legal/cookies" as Route },
  { label: "Acceptable use", href: "/legal/acceptable-use" as Route },
  { label: "Disclosures", href: "/legal/disclosures" as Route },
];

export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[200px_1fr]">
        <aside>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Legal
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-[var(--color-ink-muted)] hover:text-[var(--color-brand)]"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[11px] text-[var(--color-ink-subtle)]">
            Last updated
            <br />
            {lastUpdated}
          </p>
        </aside>
        <article className="prose max-w-none text-[var(--color-ink)] [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--color-ink)]">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {children}
          </div>
        </article>
      </section>
      <Footer />
    </main>
  );
}
