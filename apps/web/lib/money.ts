/**
 * Money formatting helpers — Klaro (no overclaiming) requires
 * that USDC values are always shown in dollars (e.g. "$4,200.00") not in
 * raw 18-decimal Gwei units. Also the principle keeps the testnet/mainnet
 * distinction honest: the function takes a `mode` so simulated values can
 * carry a visible badge upstream.
 */

/**
 * USDC ERC-20 interface on Arc uses **6 decimals** (matches USDC on every
 * other EVM chain). Arc's native interface is 18 decimals BUT only for gas
 * accounting — Klaro never reads/writes against the native side, so all
 * amounts in our code are 6-decimal.
 * Source: docs.arc.io/arc/concepts/stablecoin-native-model
 */
export const USDC_DECIMALS = 6;
const ONE = 10n ** BigInt(USDC_DECIMALS);

export function formatUSDC(amount: bigint): string {
  const whole = amount / ONE;
  const frac = amount % ONE;
  // Display 2 fractional digits (cents). Truncation matches Stripe/Circle UIs.
  const fracStr = ((frac * 100n) / ONE).toString().padStart(2, "0");
  return `$${whole.toLocaleString("en-US")}.${fracStr}`;
}

/** Convert dollars (e.g. 4200.50) → 6-decimal bigint (4_200_500_000). */
export function dollarsToUSDC(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100)) * 10n ** BigInt(USDC_DECIMALS - 2);
}

export function shortAddress(addr: string): string {
  if (!addr.startsWith("0x") || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function relativeTime(d: Date): string {
  const ms = Date.now() - +d;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
