/**
 * Financing readiness preview. v2 §27.
 * **This is NOT a loan offer, NOT approval, NOT a commitment from any lender.**
 * It's a read-only score showing how a vendor's Klaro history would appear to
 * a third-party financing partner if one ever decided to underwrite them.
 * No lending capital, no loan origination — Klaro will NEVER hold or originate
 * lending capital itself. If/when a partner integrates, vendors apply directly
 * to that partner with this preview attached (vendor-controlled disclosure).
 * The disclaimer text below must appear verbatim on every surface that shows
 * the score. Trimming or restating it = breach of (no overclaiming).
 */

import type { Invoice, CashoutOrder, VendorBalances } from "./types";

export const VERBATIM_DISCLAIMER =
  "This is not a loan offer. Not approval. Not a commitment from any lender. Klaro does not hold lending capital. This score reflects only your Klaro history and is shared at your discretion with third-party financing partners.";

export interface FinancingReadinessScore {
  /** 0-1000 composite score. Higher = stronger profile. */
  score: number;
  /** 7 sub-scores per v2 §17.2. Each 0-100. */
  sub: {
    paymentVolume: number; // 90d settled USDC throughput
    paymentRecency: number; // recency of last settled payment
    customerDiversity: number; // unique customers / total invoices
    onTimeRate: number; // settled-before-due / total
    cashoutHistory: number; // successful cashouts / total
    disputeRate: number; // (1 - disputes/total invoices)
    tenure: number; // days since vendor created
  };
  tier: "EMERGING" | "ACTIVE" | "ESTABLISHED" | "PRIORITY";
  /** Human-readable strengths to surface to a partner. */
  strengths: string[];
  /** Things the vendor should improve before approaching financing. */
  improvements: string[];
}

interface Inputs {
  vendorCreatedAt: Date;
  invoices: Invoice[];
  cashouts: CashoutOrder[];
  balances: VendorBalances;
}

const TIER_THRESHOLDS = {
  EMERGING: 0,
  ACTIVE: 400,
  ESTABLISHED: 650,
  PRIORITY: 850,
} as const;

export function computeReadiness({
  vendorCreatedAt,
  invoices,
  cashouts,
}: Inputs): FinancingReadinessScore {
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 3600 * 1000;

  const settled = invoices.filter((i) => i.status === "SETTLED");
  const recent = settled.filter((i) => now - +i.createdAt <= NINETY_DAYS);
  const totalSettledUsdc = recent.reduce((acc, i) => acc + i.amount, 0n);
  const volumeBuckets: Array<[bigint, number]> = [
    [0n, 0],
    [1_000_000_000n, 25],
    [10_000_000_000n, 50],
    [50_000_000_000n, 75],
    [200_000_000_000n, 100],
  ];
  const paymentVolume = volumeBuckets.reduce(
    (acc, [t, v]) => (totalSettledUsdc >= t ? v : acc),
    0,
  );

  const lastSettledAt = settled.reduce(
    (acc, i) => Math.max(acc, +i.createdAt),
    0,
  );
  const recencyDays =
    lastSettledAt === 0 ? 9999 : (now - lastSettledAt) / 86_400_000;
  const paymentRecency = Math.max(0, 100 - Math.round(recencyDays * 2));

  const uniqueCustomers = new Set(invoices.map((i) => i.customer.email)).size;
  const customerDiversity =
    invoices.length === 0
      ? 0
      : Math.min(
          100,
          Math.round((uniqueCustomers / Math.max(invoices.length, 1)) * 100),
        );

  const onTimeCount = settled.filter((i) => +i.createdAt <= +i.dueAt).length;
  const onTimeRate =
    settled.length === 0 ? 0 : Math.round((onTimeCount / settled.length) * 100);

  const successfulCashouts = cashouts.filter(
    (c) => c.status === "RELEASED" || c.status === "CONFIRMED",
  ).length;
  const cashoutHistory =
    cashouts.length === 0
      ? 0
      : Math.min(
          100,
          Math.round((successfulCashouts / Math.max(cashouts.length, 1)) * 100),
        );

  const disputedInvoices = invoices.filter(
    (i) => i.status === "REFUNDED" || i.status === "CANCELLED",
  ).length;
  const disputeRate =
    invoices.length === 0
      ? 100
      : Math.round((1 - disputedInvoices / Math.max(invoices.length, 1)) * 100);

  const tenureDays = (now - +vendorCreatedAt) / 86_400_000;
  const tenure = Math.min(100, Math.round(tenureDays / 3.65)); // 1 year = 100

  const sub = {
    paymentVolume,
    paymentRecency,
    customerDiversity,
    onTimeRate,
    cashoutHistory,
    disputeRate,
    tenure,
  };

  // Weighted composite (out of 1000). Weights reflect what a real financing
  // partner would care about most.
  const score = Math.round(
    sub.paymentVolume * 2.5 +
      sub.paymentRecency * 1.5 +
      sub.customerDiversity * 1.0 +
      sub.onTimeRate * 2.0 +
      sub.cashoutHistory * 1.5 +
      sub.disputeRate * 1.0 +
      sub.tenure * 0.5,
  );

  const tier: FinancingReadinessScore["tier"] =
    score >= TIER_THRESHOLDS.PRIORITY
      ? "PRIORITY"
      : score >= TIER_THRESHOLDS.ESTABLISHED
        ? "ESTABLISHED"
        : score >= TIER_THRESHOLDS.ACTIVE
          ? "ACTIVE"
          : "EMERGING";

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (sub.onTimeRate >= 90) strengths.push("Strong on-time settlement rate");
  if (sub.cashoutHistory >= 90) strengths.push("Clean cashout history");
  if (sub.customerDiversity >= 60) strengths.push("Diverse customer base");
  if (sub.tenure >= 80) strengths.push("Established Klaro tenure");
  if (sub.paymentVolume < 50)
    improvements.push("Increase settled USDC throughput over 90 days");
  if (sub.disputeRate < 95) improvements.push("Reduce refund/dispute rate");
  if (sub.customerDiversity < 30)
    improvements.push("Diversify your customer base (concentration risk)");
  if (sub.paymentRecency < 50)
    improvements.push(
      "Resume regular invoicing — last settled payment is stale",
    );

  return { score, sub, tier, strengths, improvements };
}
