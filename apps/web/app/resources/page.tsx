import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { FeatureCard } from "@/components/ui/FeatureCard";

export const metadata: Metadata = {
  title: "Resources · Klaro",
  description: "Everything you need to build, ship, and audit with Klaro.",
};

const CARDS = [
  { title: "Docs", href: "/docs", desc: "API reference, guides, and integration walkthroughs." },
  { title: "User flows", href: "/resources/flows", desc: "End-to-end journey diagrams for every Klaro flow." },
  { title: "Brand kit", href: "/brand-kit", desc: "Logo, colour palette, typography, voice guidelines." },
  { title: "Trust center", href: "/trust", desc: "11 promises we prove. Security posture and compliance." },
  { title: "Status", href: "/status", desc: "Uptime monitoring and incident history." },
  { title: "Roadmap", href: "/roadmap", desc: "What shipped, what's next, what's later." },
];

export default function ResourcesPage() {
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
          {CARDS.map((c) => (
            <FeatureCard key={c.title} title={c.title} href={c.href}>
              {c.desc}
            </FeatureCard>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
