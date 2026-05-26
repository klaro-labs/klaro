/**
 * Protocol-limits reader. Live mode pulls the seeded `protocol_limits` rows
 * (migration 0012); dev mode returns the same canonical list so the page
 * always renders truth — never silently empty.
 */
import { tryDb } from "../db";

export interface ProtocolLimit {
  category: "vendor" | "lp" | "protocol";
  label: string;
  unit: string;
  value: string;
  why: string;
}

const FALLBACK: ProtocolLimit[] = [
  {
    category: "vendor",
    label: "Daily invoice cap",
    unit: "USDC",
    value: "100,000",
    why: "Soft cap. Vendor can request raise after 30d streak.",
  },
  {
    category: "vendor",
    label: "Single invoice ceiling",
    unit: "USDC",
    value: "25,000",
    why: "Per-invoice hard cap. Higher requires manual approval.",
  },
  {
    category: "vendor",
    label: "Daily cashout cap",
    unit: "USDC",
    value: "50,000",
    why: "Sum of LP-released USDC per UTC day.",
  },
  {
    category: "vendor",
    label: "Cashout corridor cap",
    unit: "USDC",
    value: "10,000",
    why: "Per-corridor (INR/BRL/PHP/MXN) daily cap.",
  },
  {
    category: "vendor",
    label: "Retainer stream ceiling",
    unit: "USDC",
    value: "20,000",
    why: "Per-stream deposit cap (sum across active streams).",
  },

  {
    category: "lp",
    label: "Min stake (Tier 1)",
    unit: "USDC",
    value: "5,000",
    why: "Smallest claimable cashout: $200 — $1,000.",
  },
  {
    category: "lp",
    label: "Min stake (Tier 2)",
    unit: "USDC",
    value: "25,000",
    why: "Claimable: $1,000 — $5,000.",
  },
  {
    category: "lp",
    label: "Min stake (Tier 3)",
    unit: "USDC",
    value: "100,000",
    why: "Claimable: $5,000 — $25,000.",
  },
  {
    category: "lp",
    label: "Slash on bad-proof",
    unit: "bps",
    value: "1,000",
    why: "10% of stake slashed when proof verifier rejects.",
  },
  {
    category: "lp",
    label: "Slash on dispute loss",
    unit: "bps",
    value: "2,500",
    why: "25% of stake slashed when dispute resolves LP-pays.",
  },

  {
    category: "protocol",
    label: "Per-tx fee cap",
    unit: "bps",
    value: "80",
    why: "Hard ceiling on FeeSplitter total payout. Audit fix P0-2.",
  },
  {
    category: "protocol",
    label: "Agent fee cap",
    unit: "bps",
    value: "5,000",
    why: "AgentRegistry FEE_BPS_HARD_CAP. No agent can take more than 50%.",
  },
  {
    category: "protocol",
    label: "Dispute SLA",
    unit: "hours",
    value: "24",
    why: "DisputeManager auto-pings admin after this window.",
  },
  {
    category: "protocol",
    label: "Cashout confirm window",
    unit: "hours",
    value: "24",
    why: "After PROOF_SUBMITTED, vendor must confirm or dispute.",
  },
  {
    category: "protocol",
    label: "Counterparty cache TTL",
    unit: "hours",
    value: "24",
    why: "Default screening-result freshness in CounterpartyRegistry.",
  },
];

export async function listProtocolLimits(): Promise<{
  rows: ProtocolLimit[];
  source: "live" | "fallback";
}> {
  const c = await tryDb();
  if (!c) return { rows: FALLBACK, source: "fallback" };
  const { data, error } = await c
    .from("protocol_limits")
    .select("category, label, unit, value, why, position")
    .order("category", { ascending: true })
    .order("position", { ascending: true });
  if (error || !data || data.length === 0)
    return { rows: FALLBACK, source: "fallback" };
  return {
    rows: data.map((r) => ({
      category: r.category as ProtocolLimit["category"],
      label: String(r.label),
      unit: String(r.unit),
      value: String(r.value),
      why: String(r.why),
    })),
    source: "live",
  };
}
