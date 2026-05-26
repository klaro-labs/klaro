import { SectionHeader } from "../SectionHeader";

/**
 * §13 Security — 4 pillars + "All systems operational" status row.
 * Pillar icons are blue squares with single-letter glyphs for now; replace
 * with lucide icons in M3 polish.
 */

// Designer 2026-05-25 parity: titles + bodies copied verbatim from
// designer/landing/index.html security section. Honest-status framing — we
// don't claim "13 audited / live bounty" because neither is true yet today.
const PILLARS = [
  {
    glyph: "🛡",
    title: "Audit underway",
    body: "Trail of Bits + NCC Group engagement scoped for testnet phase. Halmos formal verification planned for settlement paths.",
  },
  {
    glyph: "🔒",
    title: "Screening, transparent",
    body: "Live release requires verified screening evidence. The demo shows review-only placeholders that cannot settle funds.",
  },
  {
    glyph: "👁",
    title: "Public audit packs",
    body: "Public evidence packs are a launch requirement. Demo receipts are previews and are not anchored on-chain.",
  },
  {
    glyph: "💡",
    title: "Bounty at mainnet",
    body: "Immunefi-hosted bug bounty launches with mainnet. Pre-mainnet, responsible disclosure goes to security@klaro.so.",
  },
];

export function Security() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-[clamp(80px,12vw,160px)] md:mt-[26px] md:py-[clamp(80px,12vw,160px)]">
      <SectionHeader
        eyebrow="Trust by design"
        title={
          <>
            Security and compliance,
            <br /> audited before launch.
          </>
        }
        lede="Klaro was built compliance-first. The same controls a Fortune-500 treasury team would demand — wired into every invoice, end to end."
        className="max-w-2xl"
      />

      <ul className="mt-12 grid gap-6 md:grid-cols-4">
        {PILLARS.map((p) => (
          <li key={p.title}>
            <span className="inline-flex size-9 items-center justify-center rounded-md bg-[var(--color-brand-soft)] text-base">
              {p.glyph}
            </span>
            <h3 className="mt-4 font-display text-base font-semibold">
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {p.body}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--color-bg)] ring-1 ring-inset ring-[var(--color-line)]">
            <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
          </span>
          <div>
            <p className="text-sm font-medium">Testnet status reporting</p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Current environment status and incidents are reported at
              status.klaro.so.
            </p>
          </div>
        </div>
        <a
          href="/status"
          className="text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          status.klaro.so →
        </a>
      </div>
    </section>
  );
}
