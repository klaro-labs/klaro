import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { PageHero } from "@/components/ui/PageHero";
import { Pill } from "@/components/ui/Pill";

export const metadata: Metadata = {
  title: "User Flows · Klaro",
  description: "End-to-end journey diagrams for every Klaro flow — invoice creation, payment, cashout, disputes, and more.",
};

const FLOWS = [
  { id: "§11", name: "Invoice creation", roles: ["Vendor"], states: ["DRAFT", "CREATED", "SENT"], status: "live testnet" as const },
  { id: "§12", name: "Customer payment", roles: ["Buyer", "Vendor"], states: ["ACCEPTED", "PAID", "SETTLED"], status: "live testnet" as const },
  { id: "§13", name: "Cross-chain receive", roles: ["Buyer"], states: ["INITIATED", "ROUTED", "SETTLED"], status: "simulated" as const },
  { id: "§14", name: "Screening", roles: ["Operator"], states: ["PENDING", "PASSED", "HELD", "RELEASED"], status: "simulated" as const },
  { id: "§15", name: "Receipt mint", roles: ["System"], states: ["PENDING", "MINTED", "VERIFIED"], status: "live testnet" as const },
  { id: "§19", name: "Cashout request", roles: ["Vendor", "LP"], states: ["REQUESTED", "LOCKED", "CLAIMED", "CONFIRMED", "RELEASED"], status: "simulated" as const },
  { id: "§20", name: "Cashout dispute", roles: ["Vendor", "LP", "Operator"], states: ["OPENED", "EVIDENCE", "DECIDED"], status: "simulated" as const },
  { id: "§22", name: "LP onboarding", roles: ["LP", "Operator"], states: ["INVITED", "DOCS", "REVIEW", "APPROVED", "STAKED"], status: "simulated" as const },
];

const STATUS_TONE = { "live testnet": "warm", "simulated": "default" } as const;

export default function FlowsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="User flows"
        title="How Klaro actually works."
        sub="Every flow is a state machine. These diagrams show the roles, states, and transitions for each canonical journey."
      />
      <section className="klaro-container pb-20">
        <div className="space-y-4">
          {FLOWS.map((f) => (
            <article
              key={f.id}
              className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[var(--color-muted)]">{f.id}</span>
                  <h3 className="font-display text-lg font-semibold tracking-tight">{f.name}</h3>
                </div>
                <Pill tone={STATUS_TONE[f.status]} size="sm" dot={f.status === "live testnet" ? "live" : "muted"}>
                  {f.status}
                </Pill>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {f.roles.map((r) => (
                  <span key={r} className="rounded-pill border border-[var(--color-line)] px-2.5 py-0.5 text-xs text-[var(--color-muted)]">
                    {r}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {f.states.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="rounded bg-[var(--color-bg-warm)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-2)]">
                      {s}
                    </span>
                    {i < f.states.length - 1 && (
                      <span className="text-xs text-[var(--color-muted)]">→</span>
                    )}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
