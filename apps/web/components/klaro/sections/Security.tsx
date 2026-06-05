import { SectionHeader } from "../SectionHeader";
import { Shield, Lock, Eye, Lightbulb } from "lucide-react";

/**
 * §13 Security — 4 pillars + status row.
 */

// Designer 2026-05-25 parity: titles + bodies copied verbatim from
// designer/landing/index.html security section. Honest-status framing — we
// don't claim "13 audited / live bounty" because neither is true yet today.
const PILLARS = [
  {
    Icon: Shield,
    title: "Audit underway",
    body: "Trail of Bits + NCC Group engagement scoped for testnet phase. Halmos formal verification planned for settlement paths.",
  },
  {
    Icon: Lock,
    title: "Screening, transparent",
    body: "Live release requires verified screening evidence. The demo shows review-only placeholders that cannot settle funds.",
  },
  {
    Icon: Eye,
    title: "Public audit packs",
    body: "Public evidence packs are a launch requirement. Demo receipts are previews and are not anchored on-chain.",
  },
  {
    Icon: Lightbulb,
    title: "Bounty at mainnet",
    body: "Immunefi-hosted bug bounty launches with mainnet. Pre-mainnet, responsible disclosure goes to prateek@myklaro.app.",
  },
];

export function Security() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
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
            <span className="inline-flex size-9 items-center justify-center rounded-md bg-[var(--color-brand-soft)]">
              <p.Icon className="size-5 text-[var(--color-brand)]" strokeWidth={1.75} />
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
              myklaro.app/status.
            </p>
          </div>
        </div>
        <a
          href="/status"
          className="text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          myklaro.app/status →
        </a>
      </div>
    </section>
  );
}
