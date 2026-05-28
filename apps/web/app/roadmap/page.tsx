import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { SectionHeader } from "@/components/klaro/SectionHeader";

export const metadata: Metadata = {
  title: "Roadmap · Klaro",
  description:
    "What's live, what's next, what's later. Honest labels on every item — no overpromising, no vapor.",
};

type Status = "live" | "wip" | "next" | "later";

const STATUS_META: Record<Status, { label: string; color: string }> = {
  live: { label: "Live testnet", color: "var(--color-brand)" },
  wip: { label: "In progress", color: "#F5B100" },
  next: { label: "Next up", color: "#7280A0" },
  later: { label: "Later", color: "#C0C5D0" },
};

const ITEMS: {
  quarter: string;
  title: string;
  status: Status;
  body: string;
}[] = [
  // Now
  {
    quarter: "Q1 2026",
    title: "InvoiceEscrow + AuditReceipt",
    status: "wip",
    body: "Contracts and demo receipt flow implemented; live settlement and deployment verification remain gated.",
  },
  {
    quarter: "Q1 2026",
    title: "CashoutOrderProcessor + LP stack",
    status: "wip",
    body: "Simulated cashout and dispute path implemented; real proof verification and partners remain gated.",
  },
  {
    quarter: "Q1 2026",
    title: "AgentRegistry + AgentEscrow (ERC-8004/8183)",
    status: "wip",
    body: "Contract implementation under verification; no live agent-fund flow is enabled.",
  },
  {
    quarter: "Q1 2026",
    title: "DisputeManager + ReputationManager",
    status: "wip",
    body: "Dispute enforcement fixes implemented; deployment and contract test evidence still required.",
  },
  {
    quarter: "Q1 2026",
    title: "RetainerStream",
    status: "wip",
    body: "Contract surface present; not exposed as a verified live payment feature.",
  },
  {
    quarter: "Q1 2026",
    title: "CounterpartyRegistry + PrivacyVeil",
    status: "wip",
    body: "Contract design present; live screening and privacy claims remain gated.",
  },

  // WIP
  {
    quarter: "Q2 2026",
    title: "Supabase live data layer",
    status: "wip",
    body: "38 tables, RLS per role, full audit trail. Replacing in-memory mock store.",
  },
  {
    quarter: "Q2 2026",
    title: "Daemon + 12 BullMQ workers",
    status: "wip",
    body: "ArcEventListener · ScreeningOrchestrator · ERPSync · QuoteEngine · …",
  },
  {
    quarter: "Q2 2026",
    title: "REST API + signed webhooks + OpenAPI 3.1",
    status: "wip",
    body: "20+ endpoints, HMAC-signed delivery, OpenAPI spec at /api/openapi.",
  },

  // Next
  {
    quarter: "Q2 2026",
    title: "PWA + WebAuthn + Web Push",
    status: "next",
    body: "Installable on mobile, biometric sign-in, real-time push for paid/disputed events.",
  },
  {
    quarter: "Q2 2026",
    title: "i18n — 6 languages",
    status: "next",
    body: "en · hi · pt-BR · es · tl · ar via next-intl + Crowdin + human review.",
  },
  {
    quarter: "Q2 2026",
    title: "ERP — Tally / QuickBooks / Xero / Zoho",
    status: "next",
    body: "Bi-directional sync with idempotency keys. Manual retry from the UI.",
  },
  {
    quarter: "Q3 2026",
    title: "FX corridors — BRLA · PHPC · MXNB",
    status: "next",
    body: "Live quotes from partners, expiry countdown, fail-closed when partner is offline.",
  },
  {
    quarter: "Q3 2026",
    title: "Trust Center + per-vendor compliance pack",
    status: "next",
    body: "Downloadable SOC 2 / DPA / subprocessor list. Per-vendor screening evidence bundle.",
  },

  // Later
  {
    quarter: "Q3 2026",
    title: "Mainnet pilot (10 vendors)",
    status: "later",
    body: "Bps fee + cashout spread schedule published. Multisig owns every Ownable.",
  },
  {
    quarter: "Q4 2026",
    title: "ReceivablesPool (real lending)",
    status: "later",
    body: "Invoice-backed credit. Mainnet only. Real LPs only. KYB-gated.",
  },
  {
    quarter: "Q4 2026",
    title: "PrivacyVeil v2 (real ZK)",
    status: "later",
    body: "Replace M1 keccak commit with a real Pedersen + ZK proof.",
  },
  {
    quarter: "Q4 2026",
    title: "Agent marketplace",
    status: "later",
    body: "Discover + hire ERC-8004 agents from the buyer/vendor app directly.",
  },
];

const ORDER: Status[] = ["live", "wip", "next", "later"];

export default function RoadmapPage() {
  const grouped = ORDER.map((s) => ({
    status: s,
    items: ITEMS.filter((i) => i.status === s),
  }));

  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1200px] px-6 pt-24 pb-12">
        <SectionHeader
          eyebrow="Roadmap"
          title={
            <>
              Now, next, later.
              <br />
              <span className="text-[var(--color-brand)]">No vapor.</span>
            </>
          }
          lede="Items move left as they ship. Each one is labeled honestly: live on testnet, in progress, next-up, or later. If it isn't on this list, we aren't building it yet."
        />
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 pb-24">
        {grouped
          .filter(({ items }) => items.length > 0)
          .map(({ status, items }) => (
            <div key={status} className="mt-12 first:mt-0">
              <div className="mb-6 flex items-center gap-3">
                <span
                  className="inline-flex h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_META[status].color }}
                />
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  {STATUS_META[status].label}
                </h2>
                <span className="text-sm text-[var(--color-ink-muted)]">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((it) => (
                  <article
                    key={it.title}
                    className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-base font-semibold">
                        {it.title}
                      </h3>
                      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-ink-muted)]">
                        {it.quarter}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-ink)]/80">
                      {it.body}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ))}
      </section>

      <Footer />
    </main>
  );
}
