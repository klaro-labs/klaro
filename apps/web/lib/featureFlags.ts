/**
 * GrowthBook feature-flag adapter — env-gated.
 * Live (GROWTHBOOK_HOST + GROWTHBOOK_CLIENT_KEY): fetches the GrowthBook
 * features bundle once per cold-start, caches in-memory.
 * Mock: returns the `DEFAULT_FLAGS` map below. Keeps every consumer call
 * working in dev without GrowthBook being deployed.
 * NEW FLAG NAMES go here + in CLAUDE.md so reviewers can audit + retire.
 */

import { GROWTHBOOK_HOST, GROWTHBOOK_CLIENT_KEY, growthbookLive } from "./env";

export type KlaroFlag =
  | "cashout_inr_pilot_live"
  | "fx_circle_live"
  | "x402_live_facilitator"
  | "agent_marketplace_open"
  | "reputation_snapshots_daily"
  | "lifecycle_reminders_enabled";

const DEFAULT_FLAGS: Record<KlaroFlag, boolean> = {
  cashout_inr_pilot_live: false, // mainnet only
  fx_circle_live: false, // Circle TEST access pending
  x402_live_facilitator: false, // requires X402_ENABLED + Gateway balance
  agent_marketplace_open: true, // open for testnet demo
  reputation_snapshots_daily: true, // operator daemon ticks this
  lifecycle_reminders_enabled: true, // 3/7/14d before, 1/7d after
};

interface FeaturesBundle {
  features: Record<string, { defaultValue: boolean }>;
}
let _bundle: FeaturesBundle | null = null;

async function fetchBundle(): Promise<FeaturesBundle | null> {
  if (_bundle || !growthbookLive()) return _bundle;
  try {
    const url = `${GROWTHBOOK_HOST}/api/features/${GROWTHBOOK_CLIENT_KEY}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    _bundle = (await res.json()) as FeaturesBundle;
    return _bundle;
  } catch {
    return null;
  }
}

export async function isFlagOn(flag: KlaroFlag): Promise<boolean> {
  if (!growthbookLive()) return DEFAULT_FLAGS[flag];
  const b = await fetchBundle();
  const f = b?.features?.[flag];
  return Boolean(f?.defaultValue ?? DEFAULT_FLAGS[flag]);
}

/** Sync read for client components that already preloaded the bundle. */
export function isFlagOnSync(flag: KlaroFlag): boolean {
  if (!growthbookLive() || !_bundle) return DEFAULT_FLAGS[flag];
  return Boolean(_bundle.features?.[flag]?.defaultValue ?? DEFAULT_FLAGS[flag]);
}
