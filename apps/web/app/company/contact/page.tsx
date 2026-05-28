import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact · Klaro",
  description:
    "Talk to the Klaro team. General, sales, security disclosure, and trust.",
};

const CONTACTS = [
  { role: "General", email: "hi@klaro.so", note: "Anything else." },
  { role: "Sales & partnerships", email: "sales@klaro.so", note: "ERP, LP, corridor expansion." },
  { role: "Security disclosure", email: "security@klaro.so", note: "Encrypted: PGP key on /trust." },
  { role: "Trust & compliance", email: "trust@klaro.so", note: "Vendor diligence and audit." },
] as const;

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Contact"
        title="Talk to us."
        sub="A founder reads everything that comes through. Response in one business day for general, four hours for security."
      />
      <section className="klaro-container pb-20 md:pb-28">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-12">
          <ContactForm />

          <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
              By topic
            </p>
            <dl className="mt-6 space-y-5">
              {CONTACTS.map((c) => (
                <div key={c.role}>
                  <dt className="text-sm font-medium">{c.role}</dt>
                  <dd className="mt-0.5">
                    <a
                      href={`mailto:${c.email}`}
                      className="text-sm text-[var(--color-klaro-orange)] hover:underline"
                    >
                      {c.email}
                    </a>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">{c.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-xs text-[var(--color-muted)]">
              Klaro is not yet incorporated as Klaro Labs Inc — see HUMAN_ACTIONS_NEEDED.md.
              No physical office to publish yet.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
