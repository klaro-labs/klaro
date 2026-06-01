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
