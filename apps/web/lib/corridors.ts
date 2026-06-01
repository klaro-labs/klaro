/**
 * Corridor registry + adapter framework for Partner Cashout.
 * Each corridor has the SAME interface (quote, lock, lpAssign, recordProof,
 * confirm, dispute) regardless of whether it's live or simulation. The
 * registry tags each one with an honest status per :
 * - `pilot` — INR via Mudrex/CoinDCX. Real INR moves at mainnet only.
 * Testnet uses simulated proof; everything else is real.
 * - `simulation` — adapter shipped, partner not signed. UI uses mocked
 * LP/proof so the full state machine demos.
 * - `live` — USDC native (US) — no fiat hop needed.
 * - `access-gated` — USDC↔EURC via Circle StableFX (if TEST access granted).
 * **Why this lives in one file:** flipping a corridor from `simulation` →
 * `pilot` is one edit here. All vendor UIs read `getCorridor()` so the
 * change propagates without touching any screen code.
 */

export type CorridorStatus = "pilot" | "live" | "access-gated" | "simulation";

export interface Corridor {
  code: string; // ISO-3166 country code
  country: string;
  currency: string;
  symbol: string; // display, e.g. "₹"
  route: string;
  partner: string;
  status: CorridorStatus;
  /** Indicative rate (currency per 1 USDC). Replace with live oracle in M11. */
  rate: number;
  /** Klaro service fee as a fraction (e.g. 0.003 = 0.3%). */
  klaroFee: number;
  /** LP spread as a fraction. */
  lpSpread: number;
  /** Estimated end-to-end ETA in minutes. */
  etaMinutes: number;
  /** True only when real fiat moves at testnet/mainnet today. */
  realFiatMoves: boolean;
}

export const CORRIDORS: Corridor[] = [
  {
    code: "IN",
    country: "India",
    currency: "INR",
    symbol: "₹",
    route: "Partner Cashout",
    partner: "Verified payout partner",
    status: "pilot",
    rate: 83.9,
    klaroFee: 0.003,
    lpSpread: 0.004,
    etaMinutes: 12,
    realFiatMoves: false, // testnet sim; mainnet live with partner
  },
  {
    code: "BR",
    country: "Brazil",
    currency: "BRL",
    symbol: "R$",
    route: "BRLA · simulation",
    partner: "Avenia",
    status: "simulation",
    rate: 5.06,
    klaroFee: 0.003,
    lpSpread: 0.005,
    etaMinutes: 18,
    realFiatMoves: false,
  },
  {
    code: "MX",
    country: "Mexico",
    currency: "MXN",
    symbol: "$",
    route: "MXN · simulation",
    partner: "Juno",
    status: "simulation",
    rate: 17.2,
    klaroFee: 0.003,
    lpSpread: 0.005,
    etaMinutes: 20,
    realFiatMoves: false,
  },
  {
    code: "PH",
    country: "Philippines",
    currency: "PHP",
    symbol: "₱",
    route: "PHP · simulation",
    partner: "Coins.ph",
    status: "simulation",
    rate: 56.4,
    klaroFee: 0.003,
    lpSpread: 0.005,
    etaMinutes: 25,
    realFiatMoves: false,
  },
  {
    code: "KE",
    country: "Kenya",
    currency: "KES",
    symbol: "KSh",
    route: "KES · simulation",
    partner: "Partner-pending",
    status: "simulation",
    rate: 129.5,
    klaroFee: 0.003,
    lpSpread: 0.006,
    etaMinutes: 30,
    realFiatMoves: false,
  },
  {
    code: "NG",
    country: "Nigeria",
    currency: "NGN",
    symbol: "₦",
    route: "NGN · simulation",
    partner: "Partner-pending",
    status: "simulation",
    rate: 1_550,
    klaroFee: 0.003,
    lpSpread: 0.007,
    etaMinutes: 35,
    realFiatMoves: false,
  },
  {
    code: "ZA",
    country: "South Africa",
    currency: "ZAR",
    symbol: "R",
    route: "ZAR · simulation",
    partner: "Luno",
    status: "simulation",
    rate: 18.65,
    klaroFee: 0.003,
    lpSpread: 0.005,
    etaMinutes: 22,
    realFiatMoves: false,
  },
  {
    code: "JP",
    country: "Japan",
    currency: "JPY",
    symbol: "¥",
    route: "JYPC · simulation",
    partner: "JPYC",
    status: "simulation",
    rate: 152.1,
    klaroFee: 0.003,
    lpSpread: 0.004,
    etaMinutes: 15,
    realFiatMoves: false,
  },
  {
    code: "KR",
    country: "South Korea",
    currency: "KRW",
    symbol: "₩",
    route: "KRW · simulation",
    partner: "BDACS",
    status: "simulation",
    rate: 1_360,
    klaroFee: 0.003,
    lpSpread: 0.004,
    etaMinutes: 18,
    realFiatMoves: false,
  },
  {
    code: "EU",
    country: "Eurozone",
    currency: "EUR",
    symbol: "€",
    route: "EURC · StableFX",
    partner: "Circle",
    status: "access-gated",
    rate: 0.92,
    klaroFee: 0.002,
    lpSpread: 0.001,
    etaMinutes: 1,
    realFiatMoves: false,
  },
  {
    code: "US",
    country: "United States",
    currency: "USD",
    symbol: "$",
    route: "USDC native",
    partner: "Circle",
    status: "live",
    rate: 1.0,
    klaroFee: 0,
    lpSpread: 0,
    etaMinutes: 0,
    realFiatMoves: false,
  },
];

export function getCorridor(currency: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.currency === currency);
}

export interface CashoutQuote {
  corridor: Corridor;
  usdcAmount: bigint; // 6-dec USDC
  payoutMinor: bigint; // currency × 100 (minor units, e.g. paise)
  klaroFeeUsdc: bigint;
  lpSpreadUsdc: bigint;
  expiresAt: Date;
}

/**
 * Compute a quote for the given USDC amount + corridor.
 * **Honest math ( — proof beats claims):** the payout amount
 * is calculated after subtracting the Klaro fee + LP spread from the
 * USDC, then multiplied by the corridor rate. Vendors see the same
 * breakdown the on-chain `quoteHash` will anchor.
 */
export function quoteCashout(
  usdcAmount: bigint,
  currency: string,
): CashoutQuote | null {
  const corridor = getCorridor(currency);
  if (!corridor) return null;

  // 6-dec USDC arithmetic. Use bigints throughout.
  const klaroFeeUsdc =
    (usdcAmount * BigInt(Math.round(corridor.klaroFee * 1_000_000))) /
    1_000_000n;
  const lpSpreadUsdc =
    (usdcAmount * BigInt(Math.round(corridor.lpSpread * 1_000_000))) /
    1_000_000n;
  const netUsdc = usdcAmount - klaroFeeUsdc - lpSpreadUsdc;
  // payoutMinor = (netUsdc / 1e6) * rate * 100, in PURE bigint so the value the
  // quoteHash anchors can't drift from a re-derivation at large amounts / high-rate
  // corridors (the old `Number(netUsdc)` double path lost precision past 2^53).
  // rate is a config constant (≤6dp) → scale once by 1e6, divide LAST (one truncation).
  const rateScaled = BigInt(Math.round(corridor.rate * 1_000_000));
  const payoutMinor = (netUsdc * rateScaled * 100n) / 1_000_000_000_000n;

  return {
    corridor,
    usdcAmount,
    payoutMinor,
    klaroFeeUsdc,
    lpSpreadUsdc,
    expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2-min quote validity
  };
}

export function formatPayout(minor: bigint, corridor: Corridor): string {
  const whole = Number(minor) / 100;
  return `${corridor.symbol}${whole.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
