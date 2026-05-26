/**
 * Counterparty screening cache reader. Live mode pulls real rows the daemon's
 * screen-and-settle worker (and eventual sanctionsRefresh) writes. Dev mode
 * returns an empty array — the page renders an honest empty state instead of
 * a fake "12 providers active" facade.
 */
import { tryDb } from "../db";

export interface ScreenCacheEntry {
  buyerAddress: string;
  bundleHash: string;
  decidedAt: Date;
  ttlSeconds: number;
  staleAfter: Date;
}

export async function listRecentScreenCache(
  limit = 25,
): Promise<ScreenCacheEntry[]> {
  const c = await tryDb();
  if (!c) return [];
  const { data, error } = await c
    .from("counterparty_screen_cache")
    .select("*")
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    buyerAddress: String(r.buyer_address),
    bundleHash: String(r.bundle_hash),
    decidedAt: new Date(String(r.decided_at)),
    ttlSeconds: Number(r.ttl_seconds),
    staleAfter: new Date(String(r.stale_after)),
  }));
}
