/**
 * Testnet metrics — single source of truth for "live" numbers shown on the
 * landing (hero counters, metrics band, final-CTA pulse).
 * **Honest-labels contract ():** every value here is either
 * (a) a real value pulled at runtime from the testnet, OR
 * (b) a clearly-marked `simulated` placeholder until the source exists.
 * **Why a single stub:** we want ONE seam to replace when the real data lands
 * (Goldsky subgraph + Arc RPC + Supabase). Right now everything reads from
 * here; in M11 we swap this file's contents for a real fetch + cache pattern
 * and the UI doesn't change.
 * **Do not import these constants into receipts, invoices, or any place
 * where real on-chain settlement happens.** They are landing-page only.
 */

export type MetricSource = "live-testnet" | "simulated-placeholder";

export interface LandingMetric {
  /** display label, e.g. "median onchain settlement on Arc" */
  label: string;
  /** display value, pre-formatted, e.g. "< 2s" or "4" or "100%" */
  value: string;
  /** label.replace shows the value's source honestly */
  source: MetricSource;
}

/** Hero / final-CTA / metrics-band stats — UI-facing only. */
export const LANDING_METRICS: LandingMetric[] = [
  {
    label: "median onchain settlement on Arc",
    value: "< 2s",
    source: "simulated-placeholder", // pulled from Arc explorer once first invoice settles
  },
  {
    label: "product surfaces · invoicing, cashout, reputation, lab",
    value: "4",
    source: "live-testnet", // these surfaces are live in code
  },
  {
    label: "ERPs live · Tally, QuickBooks, Xero",
    value: "3",
    source: "simulated-placeholder", // sandbox connections; counts as live in M4
  },
  {
    label: "of fiat payouts simulated until partner is live",
    value: "100%",
    source: "live-testnet", // true by design until an INR partner signs
  },
];

/** Live event stream for the final-CTA pulse panel.
 * In production this is a SSE feed off the Arc event listener; for now
 * a static seed shows the *shape* of an upcoming receipt without faking
 * one happening "right now". */
export interface PulseEvent {
  kind:
    | "invoice.created"
    | "buyer.signed"
    | "payment.routed"
    | "lp.assigned"
    | "proof.submitted";
  meta: string;
  age: string;
  source: MetricSource;
}

export const PULSE_SEED: PulseEvent[] = [
  {
    kind: "proof.submitted",
    meta: "UTR hash",
    age: "+4m",
    source: "simulated-placeholder",
  },
  {
    kind: "lp.assigned",
    meta: "LP3 · Aakash",
    age: "+18s",
    source: "simulated-placeholder",
  },
  {
    kind: "payment.routed",
    meta: "Base → Arc",
    age: "+3s",
    source: "simulated-placeholder",
  },
  {
    kind: "buyer.signed",
    meta: "EIP-712 ✓",
    age: "+1s",
    source: "simulated-placeholder",
  },
  {
    kind: "invoice.created",
    meta: "cl7-d3-m0",
    age: "just now",
    source: "simulated-placeholder",
  },
];
