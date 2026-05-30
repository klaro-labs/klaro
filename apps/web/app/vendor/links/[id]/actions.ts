"use server";

import { requireVendor } from "@/lib/auth";
import { getLinkById, deactivateLink } from "@/lib/repo/links";
import { captureError } from "@/lib/sentry";

/** Deactivate (soft-delete) a payment link. Vendor-scoped + ownership-checked
 *  against the session — never trusted from the client. */
export async function deactivateLinkAction(id: string): Promise<void> {
  const session = await requireVendor();
  const link = await getLinkById(id);
  if (!link || link.vendorId !== session.vendor.id) {
    throw new Error("not_found_or_forbidden");
  }
  try {
    await deactivateLink(id);
  } catch (e) {
    captureError(e, { action: "link.deactivate", vendorId: session.vendor.id });
    throw e;
  }
}
