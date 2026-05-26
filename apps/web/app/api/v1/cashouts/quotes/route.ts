import { handle } from "@/lib/api";
import { CashoutQuoteReq } from "@/lib/apiSchemas";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { dollarsToUSDC } from "@/lib/money";
import { computeQuoteHash } from "@/lib/cashoutQuote";
import { quoteCashout } from "@/lib/corridors";

/**
 * Cashout quote endpoint. previously
 * shipped its own `MOCK_RATES` table that diverged from `lib/corridors.ts` on
 * every supported pair (INR 83.4 vs 83.90, BRL 4.96 vs 5.06, MXN 19.8 vs
 * 17.20, etc.) — vendors got different prices depending on which surface
 * served the quote. Now delegates to the canonical `quoteCashout()` so the
 * UI cashout flow and the public API endpoint always agree.
 */
export const POST = handle(CashoutQuoteReq, async (input) => {
  const session = await requireVendor();
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);

  const usdc = dollarsToUSDC(parseFloat(input.usdcAmount));
  const q = quoteCashout(usdc, input.currency);
  if (!q) throw new Error(`corridor ${input.currency} not supported`);

  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
  const expiresAtSecs = BigInt(Math.floor(expiresAt.getTime() / 1000));

  const quoteHash = computeQuoteHash({
    vendor: vendorWallet,
    usdcAmount: q.usdcAmount,
    payoutMinor: q.payoutMinor,
    currency: input.currency,
    klaroFeeUsdc: q.klaroFeeUsdc,
    lpSpreadUsdc: q.lpSpreadUsdc,
    expiresAtSecs,
  });

  return {
    quote: {
      quoteHash,
      vendorId: session.vendor.id,
      usdcAmount: q.usdcAmount.toString(),
      payoutMinor: q.payoutMinor.toString(),
      currency: input.currency,
      klaroFeeUsdc: q.klaroFeeUsdc.toString(),
      lpSpreadUsdc: q.lpSpreadUsdc.toString(),
      quoteRate: q.corridor.rate,
      expiresAt: expiresAt.toISOString(),
    },
  };
});
