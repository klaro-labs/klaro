"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as delegationsRepo from "@/lib/repo/delegations";
import { requireVendor } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

// FormData `scope` was cast straight to SessionScope,
// so a posted `scope="EVERYTHING"` wrote a garbage enum that no
// downstream delegation-enforcement branch matched — silent ignore
// of restrictions. Same class as W77-1 / RCF1.
const SESSION_SCOPE = z.enum([
  "INVOICES_CREATE",
  "INVOICES_SETTLE",
  "CASHOUT_REQUEST",
  "READ_ONLY",
]);

export async function createSessionKeyAction(
  formData: FormData,
): Promise<void> {
  const session = await requireVendor();
  const delegate = String(formData.get("delegate") ?? "") as Hex;
  const label = String(formData.get("label") ?? "");
  const scope = SESSION_SCOPE.parse(formData.get("scope") ?? "INVOICES_CREATE");
  const ttlHours = Number(formData.get("ttlHours") ?? 24);

  if (!/^0x[0-9a-fA-F]{40}$/.test(delegate))
    throw new Error("delegate must be 0x-prefixed 20-byte address");
  if (!label) throw new Error("label required");
  if (ttlHours <= 0 || ttlHours > 24 * 30)
    throw new Error("ttl must be 1h-720h");

  try {
    await delegationsRepo.createSessionKey({
      vendorId: session.vendor.id,
      delegateAddress: delegate,
      label,
      scope,
      ttlHours,
    });
    revalidatePath("/vendor/delegations");
  } catch (e) {
    captureError(e, {
      action: "delegation.create",
      vendorId: session.vendor.id,
    });
    throw e;
  }
}

/** Revoke a delegation. Audit finding #2: previously took only the key id with
 * no session or ownership check — any URL fired the revoke. Now requires a
 * vendor session AND verifies the key belongs to that vendor. */
export async function revokeSessionKeyAction(id: string): Promise<void> {
  const session = await requireVendor();
  try {
    const key = await delegationsRepo.getSessionKey(id);
    if (!key) throw new Error("session key not found");
    if (key.vendorId !== session.vendor.id)
      throw new Error("key belongs to a different vendor");
    await delegationsRepo.revokeSessionKey(id, session.vendor.id);
    revalidatePath("/vendor/delegations");
  } catch (e) {
    captureError(e, {
      action: "delegation.revoke",
      vendorId: session.vendor.id,
      keyId: id,
    });
    throw e;
  }
}
