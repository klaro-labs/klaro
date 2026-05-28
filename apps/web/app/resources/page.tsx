import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { getLastUpdated, formatRelative } from "@/lib/contentMtime";

export const metadata: Metadata = {
  title: "Resources · Klaro",
  description: "Everything you need to build, ship, and audit with Klaro.",
};

// Re-evaluate at most every 30 minutes — keeps timestamps fresh without
// rebuilding on every request.
export const revalidate = 1800;

const CARDS: Array<{ title: string; href: string; desc: string; source: string }> = [
  { title: "Docs", href: "/docs", desc: "API reference, guides, and integration walkthroughs.", source: "app/docs/page.tsx" },
  { title: "User flows", href: "/resources/flows", desc: "End-to-end journey diagrams for every Klaro flow.", source: "app/resources/flows/page.tsx" },
  { title: "Brand kit", href: "/brand-kit", desc: "Logo, colour palette, typography, voice guidelines.", source: "app/brand-kit/page.tsx" },
  { title: "Trust center", href: "/trust", desc: "11 promises we prove. Security posture and compliance.", source: "app/trust/page.tsx" },
  { title: "Status", href: "/status", desc: "Uptime monitoring and incident history.", source: "app/status/page.tsx" },
  { title: "Roadmap", href: "/roadmap", desc: "What shipped, what's next, what's later.", source: "app/roadmap/page.tsx" },
];

export default function ResourcesPage() {
  const cards = CARDS.map((c) => ({
    ...c,
    updated: getLastUpdated(c.source),
  }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Resources"
        title="Everything you need."
        sub="Build, ship, and audit with Klaro. Docs, flows, brand assets, and trust documentation in one place."
      />
      <section className="klaro-container pb-20">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.href as Route}
              className="group block rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-[var(--klaro-tile-pad)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {c.title}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Updated {formatRelative(c.updated)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {c.desc}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-klaro-orange)] transition-transform group-hover:gap-1.5">
                Open <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Talk to us
          </p>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <a href="mailto:hi@klaro.so" className="text-[var(--color-klaro-orange)] hover:underline">hi@klaro.so</a>
            <a href="mailto:sales@klaro.so" className="text-[var(--color-klaro-orange)] hover:underline">sales@klaro.so</a>
            <a href="mailto:security@klaro.so" className="text-[var(--color-klaro-orange)] hover:underline">security@klaro.so</a>
            <a href="mailto:trust@klaro.so" className="text-[var(--color-klaro-orange)] hover:underline">trust@klaro.so</a>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
