import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";

export const metadata: Metadata = {
  title: "Contact · Klaro",
  description: "Talk to the Klaro team. General inquiries, sales, security, and press.",
};

const CONTACTS = [
  { role: "General", email: "hi@klaro.so" },
  { role: "Sales", email: "sales@klaro.so" },
  { role: "Security", email: "security@klaro.so" },
  { role: "Press", email: "press@klaro.so" },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Contact"
        title="Talk to us."
        sub="Whether you're a vendor, LP partner, or developer — we read every message."
      />
      <section className="klaro-container pb-20">
        <div className="grid gap-10 md:grid-cols-2">
          <form className="space-y-5" action="/api/contact" method="POST">
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Name
              </label>
              <input
                name="name"
                required
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Company
              </label>
              <input
                name="company"
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Message
              </label>
              <textarea
                name="message"
                required
                rows={4}
                className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
              />
            </div>
            <button
              type="submit"
              className="h-11 rounded-pill bg-[var(--color-ink)] px-6 text-sm font-medium text-white transition-all duration-150 hover:bg-black active:scale-[0.97]"
            >
              Send message
            </button>
          </form>

          <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
              By topic
            </p>
            <dl className="mt-6 space-y-4">
              {CONTACTS.map((c) => (
                <div key={c.role}>
                  <dt className="text-sm font-medium">{c.role}</dt>
                  <dd className="mt-0.5">
                    <a href={`mailto:${c.email}`} className="text-sm text-[var(--color-klaro-orange)] hover:underline">
                      {c.email}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-xs text-[var(--color-muted)]">
              Response time: 1 business day for general inquiries, 4 hours for security reports.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
