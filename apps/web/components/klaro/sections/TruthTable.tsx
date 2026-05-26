import { SectionHeader } from "../SectionHeader";

/**
 * §6 Testnet honesty truth table — 17 rows × (feature, status, note).
 * This section is the strongest trust signal Klaro has;
 * (no overclaiming) is THE reason it exists. Every row's label and tone
 * must reflect what's actually live today. Verified against:
 * designer/landing/index.html + Klaro_Final_Testnet_Complete_Full_Flow_Design_v2.md §3
 */

type Tone =
  | "live"
  | "access-gated"
  | "lab"
  | "simulated"
  | "read-only"
  | "not-in-testnet";

interface Row {
  feature: string;
  tone: Tone;
  note: string;
}

const ROWS: Row[] = [
  {
    feature: "Invoice creation",
    tone: "simulated",
    note: "Demo flow available · contract mode gated",
  },
  {
    feature: "USDC / EURC payment",
    tone: "simulated",
    note: "Demo payment only in current UI",
  },
  {
    feature: "Invoice escrow",
    tone: "access-gated",
    note: "Requires verified contract deployment",
  },
  {
    feature: "Cross-chain intake · Gateway / CCTP V2",
    tone: "access-gated",
    note: "Circle integration not activated in demo",
  },
  {
    feature: "Counterparty screening",
    tone: "simulated",
    note: "Simulation cannot settle funds",
  },
  {
    feature: "Stenn-Proof receipts",
    tone: "simulated",
    note: "Public demo receipt · no proof anchor",
  },
  {
    feature: "Vendor reputation · ERC-8004",
    tone: "simulated",
    note: "Demo score and event history",
  },
  {
    feature: "ERP sync · Tally / QBO / Xero",
    tone: "access-gated",
    note: "Connector access pending",
  },
  {
    feature: "Buyer acceptance · EIP-712",
    tone: "simulated",
    note: "Demo acceptance marker only",
  },
  { feature: "LP staking", tone: "simulated", note: "Demo LP assignment only" },
  {
    feature: "StableFX · USDC ↔ EURC",
    tone: "access-gated",
    note: "Live if Circle grants TEST access",
  },
  {
    feature: "Agent escrow · ERC-8183",
    tone: "lab",
    note: "Arc-supported lab preview",
  },
  {
    feature: "Partner Cashout · USDC → INR",
    tone: "simulated",
    note: "Mock proof · no real INR moves",
  },
  {
    feature: "Local stables · BRL, MXN, PHP, ZAR…",
    tone: "simulated",
    note: "Adapter-ready · partner-pending",
  },
  {
    feature: "Financing readiness",
    tone: "read-only",
    note: "Read-only · no loans in testnet",
  },
  {
    feature: "Real bank payout",
    tone: "not-in-testnet",
    note: "Mainnet · partner-dependent",
  },
  {
    feature: "Real lending capital",
    tone: "not-in-testnet",
    note: "Mainnet · partner + legal gated",
  },
];

const TONES: Record<Tone, { label: string; dot: string; pill: string }> = {
  live: {
    label: "Live on testnet",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  "access-gated": {
    label: "Access-gated",
    dot: "bg-[var(--color-brand)]",
    pill: "bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
  },
  lab: {
    label: "Lab preview",
    dot: "bg-[var(--color-gold)]",
    pill: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  simulated: {
    label: "Simulated",
    dot: "bg-[var(--color-ink-subtle)]",
    pill: "bg-[var(--color-bg)] text-[var(--color-ink-muted)] ring-[var(--color-line)]",
  },
  "read-only": {
    label: "Read-only",
    dot: "bg-violet-400",
    pill: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  "not-in-testnet": {
    label: "Not in testnet",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-200",
  },
};

export function TruthTable() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-6 py-[clamp(80px,12vw,160px)] md:mt-[657px] md:py-[clamp(80px,12vw,160px)]">
      <div className="grid gap-12 md:grid-cols-[1fr_2fr]">
        <div>
          <SectionHeader
            eyebrow="Testnet honesty"
            title={
              <>
                What&rsquo;s real,
                <br /> what&rsquo;s simulated.
              </>
            }
            lede="Klaro currently demonstrates the product flow in simulator mode. Contract, Circle, provider, and partner capabilities remain gated until they are deployed, configured, and verified."
          />
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-[var(--color-ink-muted)]">
            {(Object.keys(TONES) as Tone[]).map((tone) => (
              <li key={tone} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${TONES[tone].dot}`}
                />
                {TONES[tone].label}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Feature</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const t = TONES[r.tone];
                return (
                  <tr
                    key={r.feature}
                    className="border-b border-[var(--color-line)] last:border-b-0"
                  >
                    <td className="px-5 py-3 align-middle font-medium text-[var(--color-ink)]">
                      {r.feature}
                    </td>
                    <td className="px-3 py-3 align-middle whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider ring-1 ring-inset ${t.pill}`}
                      >
                        <span
                          aria-hidden
                          className={`size-1.5 rounded-full ${t.dot}`}
                        />
                        {t.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-xs text-[var(--color-ink-muted)]">
                      {r.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
