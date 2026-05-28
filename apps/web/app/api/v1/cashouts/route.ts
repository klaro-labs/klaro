import { handle, handleGet } from "@/lib/api";
import { CashoutCreateReq } from "@/lib/apiSchemas";
import { requireVendor } from "@/lib/auth";
import { listForVendor } from "@/lib/repo/cashouts";
import { createCashoutAction } from "@/app/vendor/cashout/actions";

export const GET = handleGet(async () => {
  const session = await requireVendor();
  const cashouts = await listForVendor(session.vendor.id);
  return { cashouts };
});

/**
 * Create a cashout. previous version ignored
 * the body and hardcoded `$2400 → ₹2,01,360` for every request. Now we route
 * to the same `createCashoutAction` the vendor UI uses, so the API + UI never
 * diverge and a quote invalid in one is invalid in the other.
 */
export const POST = handle(CashoutCreateReq, async (input) => {
  await requireVendor();
  const orderId = await createCashoutAction({
    usdcAmount: input.usdcAmount,
    payoutMinor: input.payoutMinor,
    currency: input.currency,
    klaroFeeUsdc: input.klaroFeeUsdc,
    lpSpreadUsdc: input.lpSpreadUsdc,
    quoteRate: input.quoteRate,
    quoteExpiresAtIso: input.quoteExpiresAtIso,
    // Audit fix (loop ): forward the negotiated hash so the action
    // refuses to proceed when any quote field was tampered between negotiation
    // and submit.
    expectedQuoteHash: input.quoteHash as `0x${string}`,
  });
  return { orderId };
});
