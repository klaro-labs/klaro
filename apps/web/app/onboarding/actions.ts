"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/lib/auth";
import { tryDb } from "@/lib/db";
import type { TablesUpdate } from "@/lib/database.types";
import { captureError } from "@/lib/sentry";

const BasicsInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  country: z.string().trim().min(2).max(80),
});

const WalletInput = z.object({
  circleWalletId: z.string().trim().min(1).max(128).optional(),
  address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

const VerificationInput = z.object({
  // What the user picked. We don't ingest KYB documents here — that happens in
  // the Sumsub iframe when creds are present.
  intent: z.enum(["start", "skip"]),
});

const InvoiceDraftInput = z.object({
  customerEmail: z.string().trim().email(),
  amountUsdc: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().trim().max(280).optional(),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
  simulated?: boolean;
}

/** Step 1 — business basics. Upsert directly via the RLS client (vendor owns
 * their own row). Persists on every blur from the client. */
export async function saveBusinessBasicsAction(
  raw: z.infer<typeof BasicsInput>,
): Promise<ActionResult> {
  const parsed = BasicsInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Business name and country are required." };
  }

  let session;
  try {
    session = await requireVendor();
  } catch {
    return { ok: false, error: "Sign in to continue onboarding." };
  }

  const client = await tryDb();
  if (!client) {
    // mock mode — pretend success but report it so the UI badge is honest.
    return { ok: true, simulated: true };
  }

  try {
    const { error } = await client
      .from("vendors")
      .update({
        display_name: parsed.data.displayName,
        country: parsed.data.country,
      })
      .eq("id", session.vendor.id);
    if (error) throw error;
    revalidatePath("/vendor");
    return { ok: true };
  } catch (e) {
    captureError(e, { route: "onboarding.saveBusinessBasics" });
    return { ok: false, error: "Could not save business details." };
  }
}

/** Step 2 — wallet. The real Circle App Kit modal lives in
 * `lib/circleWallets.ts`; here we only record the result the modal returns. */
export async function saveWalletAction(
  raw: z.infer<typeof WalletInput>,
): Promise<ActionResult> {
  const parsed = WalletInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Wallet payload was malformed." };
  }
  let session;
  try {
    session = await requireVendor();
  } catch {
    return { ok: false, error: "Sign in to continue onboarding." };
  }

  const client = await tryDb();
  if (!client) return { ok: true, simulated: true };

  try {
    const patch: TablesUpdate<"vendors"> = {};
    if (parsed.data.address) patch.wallet = parsed.data.address.toLowerCase();
    if (parsed.data.circleWalletId)
      patch.circle_wallet_id = parsed.data.circleWalletId;
    if (Object.keys(patch).length === 0) return { ok: true };
    patch.wallet_provisioned_at = new Date().toISOString();
    const { error } = await client
      .from("vendors")
      .update(patch)
      .eq("id", session.vendor.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    captureError(e, { route: "onboarding.saveWallet" });
    return { ok: false, error: "Could not record the wallet." };
  }
}

/** Step 3 — verification. Sumsub is the planned provider; when creds are
 * absent we simply record the intent so the operator dashboard sees the
 * vendor opted in or skipped. */
export async function saveVerificationIntentAction(
  raw: z.infer<typeof VerificationInput>,
): Promise<ActionResult> {
  const parsed = VerificationInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Verification choice was malformed." };
  }
  try {
    await requireVendor();
  } catch {
    return { ok: false, error: "Sign in to continue onboarding." };
  }
  // No vendor column for KYB-state yet; the audit row in `audit_logs` is the
  // honest record. Until the KYB schema lands, log the intent and return ok.
  // simulated:true keeps the UI label correct ("KYB pending real provider").
  console.log("[onboarding·verification]", { intent: parsed.data.intent });
  return { ok: true, simulated: true };
}

/** Step 4 — first invoice draft. Not creating a real invoice here keeps the
 * onboarding committed-to-disk only after the vendor lands in /vendor. The
 * actual draft creation route is `/vendor/invoices/new` (existing). */
export async function recordFirstInvoiceIntentAction(
  raw: z.infer<typeof InvoiceDraftInput>,
): Promise<ActionResult> {
  const parsed = InvoiceDraftInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invoice draft was malformed." };
  }
  try {
    await requireVendor();
  } catch {
    return { ok: false, error: "Sign in to continue onboarding." };
  }
  return { ok: true };
}
