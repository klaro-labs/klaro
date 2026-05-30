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
  // Round to FULL 6-decimal USDC precision, not to cents. The previous
  // `round(dollars*100) * 1e4` quantised every amount to whole cents — a $1.005
  // invoice silently became $1.01, and any API caller passing sub-cent precision
  // lost it (audit 2026-05-30). assertSafeUSDAmount caps at $1B, so
  // dollars * 1e6 ≤ 1e15 stays within Number.MAX_SAFE_INTEGER.
  return BigInt(Math.round(dollars * 10 ** USDC_DECIMALS));
}

/**
 * Validate a dollar amount before any BigInt or contract-call use.
 * Three sibling actions hit the same gap (QA-048/049): `<= 0` passes
 * Infinity, NaN silently propagates, negative bigints sneak through
 * `=== 0n`. Centralised so every amount-handling action gets the same
 * guarantees. Throws with a `validation_` prefix so lib/api.ts handle()
 * maps it to 400 not 500.
 *
 * @param dollars Caller-supplied amount in dollars (e.g. 100.50).
 * @param cap Maximum allowed in dollars; default $1B overflow guard.
 */
export function assertSafeUSDAmount(
  dollars: number,
  cap = 1_000_000_000,
): void {
  if (!Number.isFinite(dollars))
    throw new Error("validation_amount_not_finite");
  if (dollars <= 0)
    throw new Error("validation_amount_out_of_range: must be > 0");
  if (dollars > cap)
    throw new Error(`validation_amount_out_of_range: must be ≤ $${cap}`);
}

/**
 * Parse a string into a positive bigint (raw 6-decimal USDC). Used by
 * cashout + other paths where the amount arrives as a string from an
 * untrusted client (BigInt('Infinity') throws sync; '=== 0n' doesn't
 * catch negatives — QA-049). Throws on every defective shape with a
 * validation_ prefix.
 *
 * @param raw The raw string (typically a JS bigint serialised to string).
 * @param cap Maximum allowed raw USDC units; default 1e15 (~$1B).
 */
export function parseSafeUsdcBigint(
  raw: string,
  cap = 1_000_000_000_000_000n,
): bigint {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    throw new Error("validation_amount_unparseable");
  }
  if (v <= 0n)
    throw new Error("validation_amount_out_of_range: must be > 0");
  if (v > cap)
    throw new Error("validation_amount_out_of_range: above safe cap");
  return v;
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
