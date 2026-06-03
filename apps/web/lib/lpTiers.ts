/**
 * LP stake → tier mapping. Single source of truth shared by the stake action and
 * the stake page so the advertised tiers (incl. T4 ≥ $10k) and the granted tier
 * can never drift. Tier gates payout caps + auto-claim eligibility, so a wrong
 * tier is an economic mis-grant — keep this and `lp/stake/page.tsx` TIERS aligned.
 */
export type LpTier = 0 | 1 | 2 | 3 | 4;

/** Derive the LP tier from the staked USD amount (whole dollars, the validated
 * stake input). Thresholds: T0 ≥ $50, T1 ≥ $100, T2 ≥ $500, T3 ≥ $2,000, T4 ≥ $10,000. */
export function stakeTier(amountUsd: number): LpTier {
  if (amountUsd >= 10000) return 4;
  if (amountUsd >= 2000) return 3;
  if (amountUsd >= 500) return 2;
  if (amountUsd >= 100) return 1;
  return 0;
}

/**
 * The displayable tier schedule — the single source of truth for the stake and
 * reputation pages. The audit found the stake page listing five tiers
 * ($50/$100/$500/$2,000/$10,000) while the reputation page listed a conflicting
 * three-tier $5k/$25k/$100k table, so a financial counterparty saw contradictory
 * collateral numbers on adjacent screens. Both pages now render from this array.
 *
 * `min` matches the `stakeTier()` thresholds above. `color` is a design-system
 * token (never a raw hex) so the per-tier status dot cannot drift off-palette.
 */
export interface LpTierSpec {
  tier: LpTier;
  /** Short label, e.g. "T0". */
  label: string;
  /** Minimum stake in whole USDC, aligned with `stakeTier()`. */
  min: number;
  /** Human-readable minimum stake, e.g. "$50". */
  minLabel: string;
  /** Per-order payout cap copy. */
  cap: string;
  /** One line on what the tier unlocks. */
  description: string;
  /** Design-system color token for the tier status dot. */
  color: string;
}

export const LP_TIERS: LpTierSpec[] = [
  {
    tier: 0,
    label: "T0",
    min: 50,
    minLabel: "$50",
    cap: "Quote-only",
    description: "No payouts yet — learn the queue rhythm",
    color: "var(--color-muted-2)",
  },
  {
    tier: 1,
    label: "T1",
    min: 100,
    minLabel: "$100",
    cap: "Up to $100 / order",
    description: "Manual-claim small orders",
    color: "var(--color-klaro-orange)",
  },
  {
    tier: 2,
    label: "T2",
    min: 500,
    minLabel: "$500",
    cap: "Up to $500 / order",
    description: "Auto-claim eligible",
    color: "var(--color-klaro-gold)",
  },
  {
    tier: 3,
    label: "T3",
    min: 2000,
    minLabel: "$2,000",
    cap: "Up to $2,000 / order",
    description: "Priority routing + reduced spread",
    color: "var(--color-klaro-orange)",
  },
  {
    tier: 4,
    label: "T4",
    min: 10000,
    minLabel: "$10,000",
    cap: "Custom institutional",
    description: "Governance-gated, contact Klaro BD",
    color: "var(--color-klaro-gold)",
  },
];
