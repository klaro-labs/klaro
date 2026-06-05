"use server";

import { revalidatePath } from "next/cache";
import { mockUpdateVendorBranding } from "@/lib/mockData";
import { updateVendorBranding } from "@/lib/repo/vendors";
import { supabaseLive } from "@/lib/env";
import { requireVendor } from "@/lib/auth";
import { captureError } from "@/lib/sentry";

export async function updateBrandingAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim();
  const brandLogoUrl = String(formData.get("brandLogoUrl") ?? "").trim();
  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    throw new Error("brand color must be a hex like #1B6BFF");
  }
  // Audit fix (loop ): brand logo URL must be http(s) — previously
  // accepted any string, opening data:, javascript:, etc. injection paths.
  if (brandLogoUrl && !/^https?:\/\//.test(brandLogoUrl)) {
    throw new Error("brand logo URL must start with http(s)");
  }
  try {
    // previously always routed to mockUpdateVendorBranding.
    // The real Supabase writer (lib/repo/vendors.ts:updateVendorBranding)
    // existed but was never called — vendor edits in live mode wrote
    // to in-memory mock state only, page revalidated, next read showed
    // the stale DB row → vendor thinks the save silently failed.
    // Same honest-label class as W87-4 (mock-dispute leak in live mode).
    const patch = {
      displayName: displayName || undefined,
      brandColor: brandColor || undefined,
      brandLogoUrl: brandLogoUrl || undefined,
    };
    if (supabaseLive()) {
      await updateVendorBranding(session.vendor.id, patch);
    } else {
      await mockUpdateVendorBranding(session.vendor.id, patch);
    }
    revalidatePath("/vendor/settings");
    revalidatePath("/i", "layout"); // hosted-invoice layouts pick up new brand
    revalidatePath("/receipt", "layout");
  } catch (e) {
    captureError(e, {
      action: "settings.branding",
      vendorId: session.vendor.id,
    });
    throw e;
  }
}

/**
 * Mint a Sumsub WebSDK access token for the vendor's KYB verification flow.
 * The applicant is keyed by externalUserId = vendor id, so the daemon's
 * screening worker reads the same verification when settling.
 */
export async function getKybTokenAction(): Promise<{ token: string }> {
  const { vendor } = await requireVendor();
  const { createKybAccessToken, sumsubConfigured } = await import("@/lib/sumsub");
  if (!sumsubConfigured()) throw new Error("kyb_not_configured");
  try {
    const token = await createKybAccessToken(vendor.id);
    return { token };
  } catch (e) {
    captureError(e, { action: "settings.kyb_token", vendorId: vendor.id });
    throw e;
  }
}
