/**
 * OFAC sanctions screening — the real, free, no-account sanctions source.
 *
 * The US Treasury's OFAC SDN list publishes sanctioned crypto-wallet addresses
 * (the authoritative list Chainalysis/TRM resell). We fetch the SDN CSV, extract
 * every "Digital Currency Address - <TYPE> <ADDR>" entry, cache the set in
 * memory (refreshed daily by the sanctions-refresh cron + lazily on first use),
 * and screen each buyer address against it.
 *
 * Fail-closed: if the list can't be fetched and we have no cache, a screen
 * returns `available:false` and the caller holds the invoice for manual review
 * — it never auto-passes a buyer we couldn't actually screen.
 */
import { log } from "./log.js";

const OFAC_SDN_URLS = [
  // Direct download from OFAC's current list service.
  "https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv",
  // Legacy path (302-redirects to a signed mirror; fetch follows it).
  "https://www.treasury.gov/ofac/downloads/sdn.csv",
];

// Matches "Digital Currency Address - ETH 0xabc…", "… - XBT 1abc…", etc.
const CRYPTO_ADDRESS_RE =
  /Digital Currency Address - [A-Za-z0-9]+ ([a-zA-Z0-9]+)/g;

const REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Pure parser — extracts the lowercased sanctioned addresses from SDN CSV text. */
export function parseOfacCryptoAddresses(csv: string): Set<string> {
  const out = new Set<string>();
  for (const m of csv.matchAll(CRYPTO_ADDRESS_RE)) {
    const addr = m[1];
    if (addr) out.add(addr.toLowerCase());
  }
  return out;
}

interface OfacCache {
  addresses: Set<string>;
  fetchedAt: number;
}
let cache: OfacCache | null = null;

/** Fetch + parse the OFAC SDN list and replace the in-memory cache. */
export async function refreshOfacAddresses(): Promise<number> {
  let csv: string | null = null;
  let lastErr = "";
  for (const url of OFAC_SDN_URLS) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) {
        csv = await res.text();
        break;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
      log.warn("ofac.fetch.error", { url, err: lastErr });
    }
  }
  if (!csv) throw new Error(`ofac_fetch_failed: ${lastErr}`);
  const addresses = parseOfacCryptoAddresses(csv);
  if (addresses.size === 0) {
    // A 200 with zero addresses means the format changed — do NOT overwrite a
    // good cache with an empty set (that would silently disable screening).
    throw new Error("ofac_parse_empty: SDN CSV returned 0 crypto addresses");
  }
  cache = { addresses, fetchedAt: Date.now() };
  log.info("ofac.refresh.ok", { count: addresses.size });
  return addresses.size;
}

export interface SanctionsCheck {
  /** false = list could not be loaded → caller must hold for review. */
  available: boolean;
  sanctioned: boolean;
  listSize: number;
  refreshedAt: number | null;
}

/** Screen one address against the OFAC SDN crypto-address list. */
export async function checkAddressSanctioned(
  address: string,
): Promise<SanctionsCheck> {
  if (!cache || Date.now() - cache.fetchedAt > REFRESH_TTL_MS) {
    try {
      await refreshOfacAddresses();
    } catch (e) {
      log.error("ofac.refresh.failed", { err: (e as Error).message });
      if (!cache) {
        return { available: false, sanctioned: false, listSize: 0, refreshedAt: null };
      }
      // Otherwise fall through and use the (stale but real) cache.
    }
  }
  const c = cache!;
  return {
    available: true,
    sanctioned: c.addresses.has(address.toLowerCase()),
    listSize: c.addresses.size,
    refreshedAt: c.fetchedAt,
  };
}
