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
    tone: "live",
    note: "On-chain invoice on Arc testnet",
  },
  {
    feature: "USDC payment + escrow",
    tone: "live",
    note: "Testnet USDC · InvoiceEscrow locks + releases on Arc",
  },
  {
    feature: "Counterparty screening",
    tone: "live",
    note: "OFAC sanctions list + Sumsub KYB — real",
  },
  {
    feature: "Klaro Proof receipts",
    tone: "live",
    note: "AuditReceipt anchored on-chain · publicly verifiable",
  },
  {
    feature: "Vendor reputation · ERC-8004",
    tone: "live",
    note: "Signed reputation events on Arc",
  },
  {
    feature: "Buyer acceptance · EIP-712",
    tone: "live",
    note: "Signed acceptance recorded on settle",
  },
  {
    feature: "ERP sync · QuickBooks",
    tone: "live",
    note: "QuickBooks live (sandbox) · Xero / Tally pending",
  },
  {
    feature: "Cross-chain intake · CCTP V2",
    tone: "lab",
    note: "Outbound burn proven on Arc · inbound code-ready",
  },
  {
    feature: "StableFX · USDC ↔ EURC",
    tone: "lab",
    note: "MockEURC swap proven · live needs Circle TEST access",
  },
  {
    feature: "Agent escrow · ERC-8183",
    tone: "lab",
    note: "Arc-supported lab preview · proven on testnet",
  },
  {
    feature: "Partner Cashout · USDC → INR",
    tone: "simulated",
    note: "On-chain USDC escrow live · INR payout simulated (no licensed partner)",
  },
  {
    feature: "LP staking + assignment",
    tone: "simulated",
    note: "Demo assignment · invite-only network not yet open",
  },
  {
    feature: "Local stables · BRL, MXN, PHP, ZAR…",
    tone: "simulated",
    note: "Adapter-ready · partner-pending",
  },
  {
    feature: "Financing readiness",
    tone: "read-only",
    note: "Read-only signal · no loans in testnet",
  },
  {
    feature: "Real bank payout",
    tone: "not-in-testnet",
    note: "Mainnet · licensed-partner-dependent",
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
    pill: "bg-[var(--color-brand-soft)] text-[var(--color-klaro-orange-deep)] ring-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
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
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
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
            lede="Klaro runs real contracts on Arc testnet today. Rows marked live work on testnet now (testnet USDC — no real money moves). Simulated marks the fiat, legal, and partner-gated legs that can only be real on mainnet."
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

        <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
          <table className="w-full min-w-[520px] text-sm">
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
