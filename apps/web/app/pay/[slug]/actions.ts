"use server";

// Public (no-auth) pay-junction for Klaro Link. Called from PayFromLink right
// before the wagmi acceptAndPay flow: resolve the link, create/reuse the
// backing invoice (service-role, idempotent), publish it on-chain via the
// relayer, and return the exact pay params PayWithUSDC needs.
import {
  getLinkBySlug,
  getOrCreateLinkInvoice,
  type LinkInvoiceParams,
} from "@/lib/repo/links";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

export async function getOrCreateInvoiceForLink(
  slug: string,
  buyerWallet: Hex,
): Promise<LinkInvoiceParams> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(buyerWallet)) {
    throw new Error("validation_invalid_buyer_wallet");
  }
  try {
    const link = await getLinkBySlug(slug);
    if (!link) throw new Error("link_not_found");
    return await getOrCreateLinkInvoice(link, buyerWallet);
  } catch (e) {
    captureError(e, { action: "link.pay.getOrCreateInvoice", slug });
    throw e;
  }
}
