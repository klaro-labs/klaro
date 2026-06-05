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
  description:
    "Docs, user flows, brand kit, trust center, status, and roadmap — everything you need to build, ship, and audit with Klaro.",
};

// Re-evaluate at most every 30 minutes — keeps timestamps fresh without
// rebuilding on every request.
export const revalidate = 1800;

type Card = {
  group: "Build" | "Trust";
  title: string;
  href: string;
  desc: string;
  source: string;
};

const CARDS: Card[] = [
  {
    group: "Build",
    title: "Docs",
    href: "/docs",
    desc: "API reference, contract ABIs, integration guides. Written for engineers who already know the domain.",
    source: "app/docs/page.tsx",
  },
  {
    group: "Build",
    title: "User flows",
    href: "/resources/flows",
    desc: "State-machine diagrams for invoice, payment, cashout, dispute, and every other canonical journey.",
    source: "app/resources/flows/page.tsx",
  },
  {
    group: "Build",
    title: "Brand kit",
    href: "/brand-kit",
    desc: "Logo, colour palette, typography, voice guidelines, downloadable asset bundle.",
    source: "app/brand-kit/page.tsx",
  },
  {
    group: "Trust",
    title: "Trust center",
    href: "/trust",
    desc: "Eleven promises we prove. Security posture, audit history, and compliance evidence.",
    source: "app/trust/page.tsx",
  },
  {
    group: "Trust",
    title: "Status",
    href: "/status",
    desc: "Live testnet uptime, contract pause state, partner-outage signal, incident history.",
    source: "app/status/page.tsx",
  },
  {
    group: "Trust",
    title: "Roadmap",
    href: "/roadmap",
    desc: "What shipped, what's next, what's later. Updated every milestone.",
    source: "app/roadmap/page.tsx",
  },
];

export default function ResourcesPage() {
  const cards = CARDS.map((c) => ({ ...c, updated: getLastUpdated(c.source) }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Resources"
        title="Everything you need."
        sub="Build, ship, and audit with Klaro. Docs, flows, brand assets, and trust documentation in one place. Every card carries the timestamp of its last commit."
      />

      <section className="klaro-container pb-20">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.href as Route}
              className="group flex flex-col rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-[var(--klaro-tile-pad)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-ink)] hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-klaro-orange)]">
                  {c.group}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Updated {formatRelative(c.updated)}
                </span>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {c.desc}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-klaro-orange)] transition-transform group-hover:gap-1.5">
                Open <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>

        {/* Talk to us — role-routed inboxes */}
        <div className="mt-12 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6 md:p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
            Talk to us
          </p>
          <p className="mt-3 max-w-xl text-sm text-[var(--color-muted)]">
            Pick the inbox that matches your reason for reaching out. A human reads every message; we reply within one business day.
          </p>
          <ul className="mt-6 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
            <ContactRow label="General" addr="prateek@myklaro.app" />
            <ContactRow label="Sales · partnerships" addr="prateek@myklaro.app" />
            <ContactRow label="Security disclosure" addr="prateek@myklaro.app" />
            <ContactRow label="Trust · compliance" addr="prateek@myklaro.app" />
          </ul>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function ContactRow({ label, addr }: { label: string; addr: string }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </span>
      <a
        href={`mailto:${addr}`}
        className="text-[var(--color-klaro-orange)] hover:underline"
      >
        {addr}
      </a>
    </li>
  );
}
