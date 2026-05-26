/**
 * MoonPay sandbox adapter. #15.
 * Live mode (MOONPAY_PUBLIC_KEY set): builds a sandbox iframe URL the buyer
 * loads to fund a USDC on-ramp from card → Arc-side USDC. Real prod uses
 * signed URL params (MOONPAY_SECRET_KEY HMAC).
 * Mock mode: returns a static "would open MoonPay sandbox" descriptor — the
 * /i/[id] panel surfaces a `Card → USDC · simulated` button that loops to a
 * stub page acknowledging the simulation per .
 */

import { MOONPAY_PUBLIC_KEY, moonpayLive } from "./env";

export interface MoonPayLink {
  mode: "live" | "mock";
  url: string;
  status: string;
}

/** Audit fix 2026-05-25 P1 (#92): MoonPay accepts a fixed currency code per
 * chain. Anything else returns a 400 from MoonPay (looks like a Klaro bug
 * to the buyer). Bound here so we never assemble a bad URL. */
const SUPPORTED_CURRENCY_CODES = new Set<string>(["usdc_arc"]);
const MIN_AMOUNT_USDC = 20; // MoonPay card minimum
const MAX_AMOUNT_USDC = 12_000; // MoonPay daily cap for unverified buyers

function validateAmount(amountUsdc: number): number {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) return MIN_AMOUNT_USDC;
  return Math.max(
    MIN_AMOUNT_USDC,
    Math.min(MAX_AMOUNT_USDC, Math.round(amountUsdc)),
  );
}

function pickCurrencyCode(requested?: string): string {
  if (requested && SUPPORTED_CURRENCY_CODES.has(requested)) return requested;
  return "usdc_arc";
}

export function buildMoonpayLink(opts: {
  walletAddress: string;
  amountUsdc: number; // dollars
  redirectUrl: string;
  currencyCode?: string;
}): MoonPayLink {
  const amount = validateAmount(opts.amountUsdc);
  const currency = pickCurrencyCode(opts.currencyCode);

  if (!moonpayLive()) {
    return {
      mode: "mock",
      url: `${opts.redirectUrl}?moonpay=simulated&amount=${amount}&currency=${currency}`,
      status: "Simulated · MOONPAY_PUBLIC_KEY not set",
    };
  }
  const params = new URLSearchParams({
    apiKey: MOONPAY_PUBLIC_KEY!,
    currencyCode: currency,
    walletAddress: opts.walletAddress,
    baseCurrencyAmount: String(amount),
    redirectURL: opts.redirectUrl,
    // In prod this URL gets HMAC-signed with MOONPAY_SECRET_KEY.
  });
  return {
    mode: "live",
    url: `https://buy-sandbox.moonpay.com/?${params.toString()}`,
    status: "Live · MoonPay sandbox",
  };
}
