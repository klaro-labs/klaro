"use server";

import { revalidatePath } from "next/cache";
import { requireVendor } from "@/lib/auth";
import { mockCreateFxQuote, mockSettleFxQuote } from "@/lib/mockData";
import { dollarsToUSDC } from "@/lib/money";
import { record as auditRecord } from "@/lib/auditLog";

/// Indicative rates per pair (dst per 1 src). Replace with adapter.quote() in live mode.
const RATES: Record<string, number> = {
  "USDC->EURC": 0.92,
  "EURC->USDC": 1.087,
  "USDC->USYC": 0.998,
  "USYC->USDC": 1.002,
};

/// both actions were unauthenticated.
/// Anonymous attackers could spam-create quotes (denial of service) or
/// settle other vendors' quotes (cross-tenant fund-state mutation). Now
/// both gated through `requireVendor()`; settle additionally verifies the
/// quote belongs to the caller via the new `vendorId` field on FxQuote.

export async function quoteAction(formData: FormData): Promise<void> {
  const { vendor } = await requireVendor();
  const src = String(formData.get("src") ?? "USDC");
  const dst = String(formData.get("dst") ?? "EURC");
  const amount = Number(formData.get("amount") ?? 0);
  if (amount <= 0) throw new Error("amount_must_be_positive");
  const rate = RATES[`${src}->${dst}`];
  if (!rate) throw new Error("unsupported_pair");

  await mockCreateFxQuote({
    vendorId: vendor.id,
    srcToken: src,
    dstToken: dst,
    srcAmountUsdc: dollarsToUSDC(amount),
    rate,
    status:
      (src === "USDC" && dst === "EURC") || (src === "EURC" && dst === "USDC")
        ? "access pending"
        : "simulated",
  });
  auditRecord({
    actor: vendor.id,
    action: "fx.quote.create",
    subjectKind: "corridor",
    subjectId: `${src}->${dst}`,
    noteMd: `Indicative quote requested for ${amount} ${src}.`,
  });
  revalidatePath("/fx");
}

export async function settleQuoteAction(id: string): Promise<void> {
  const { vendor } = await requireVendor();
  const result = await mockSettleFxQuote(id, vendor.id);
  if (!result) throw new Error("quote_not_found_or_not_owner");
  auditRecord({
    actor: vendor.id,
    action: "fx.quote.settle",
    subjectKind: "corridor",
    subjectId: id,
    noteMd: "Vendor accepted simulated or access-pending FX quote.",
  });
  revalidatePath("/fx");
}
