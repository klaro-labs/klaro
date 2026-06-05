"use server";

import { revalidatePath } from "next/cache";
import { updateLp } from "@/lib/repo/lp";
import { requireLp } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import { record as auditRecord } from "@/lib/auditLog";
import type { Hex } from "@/lib/types";

/**
 * LP settings actions. Audit finding L4 (loop 1): the LP /settings page
 * had inert buttons / toggles with no `onClick` or `formAction`. Each one
 * now routes to a real server action — either a write or an explicit refusal
 * with a next-step message, never a silent no-op.
 */

export async function rotateWalletAction(formData: FormData): Promise<void> {
  const { vendor, lp } = await requireLp();
  const next = String(formData.get("nextWallet") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(next)) {
    throw new Error("Wallet must be a 0x-prefixed 20-byte address");
  }
  if (next.toLowerCase() === lp.wallet?.toLowerCase()) {
    throw new Error("That's already your current payout wallet");
  }
  try {
    await updateLp(lp.lpId, { wallet: next as Hex });
    auditRecord({
      actor: vendor.id,
      action: "lp.rotate_wallet",
      subjectKind: "lp",
      subjectId: lp.lpId,
      noteMd: `Rotated payout wallet to ${next}`,
    });
    revalidatePath("/lp/settings");
  } catch (e) {
    captureError(e, {
      action: "lp.rotateWallet",
      vendorId: vendor.id,
      lpId: lp.lpId,
    });
    throw e;
  }
}

/// #14: LP preferences now persist to the `lp_preferences` table (keyed by
/// vendor_id, RLS vendor-scoped). Upserts via the RLS client; mock/dev is a
/// best-effort no-op so the toggle still renders.
async function upsertLpPref(
  vendorId: string,
  key: string,
  value: boolean,
): Promise<void> {
  const { tryDb } = await import("@/lib/db");
  const c = await tryDb();
  if (!c) return;
  const db = c as unknown as {
    from: (t: string) => {
      upsert: (
        v: object,
        o: object,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await db
    .from("lp_preferences")
    .upsert(
      { vendor_id: vendorId, pref_key: key, pref_value: value },
      { onConflict: "vendor_id,pref_key" },
    );
  if (error) throw new Error(error.message);
}

export async function toggleNotificationAction(
  formData: FormData,
): Promise<void> {
  const { vendor, lp } = await requireLp();
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "") === "1";
  if (!/^[a-z_.]{1,40}$/.test(key)) throw new Error("Bad preference key");
  await upsertLpPref(vendor.id, `notification.${key}`, value);
  auditRecord({
    actor: vendor.id,
    action: "lp.toggle_notification",
    subjectKind: "lp",
    subjectId: lp.lpId,
    noteMd: `notification.${key} → ${value ? "on" : "off"}`,
  });
  revalidatePath("/lp/settings");
}

export async function toggleCorridorAction(formData: FormData): Promise<void> {
  const { vendor, lp } = await requireLp();
  const corridor = String(formData.get("corridor") ?? "");
  const enable = String(formData.get("enable") ?? "") === "1";
  if (!/^[A-Z]{3}$/.test(corridor)) throw new Error("Bad corridor code");
  await upsertLpPref(vendor.id, `corridor.${corridor}`, enable);
  auditRecord({
    actor: vendor.id,
    action: "lp.toggle_corridor",
    subjectKind: "lp",
    subjectId: lp.lpId,
    noteMd: `corridor ${corridor} → ${enable ? "active" : "disabled"}`,
  });
  revalidatePath("/lp/settings");
}

export async function beginExitAction(): Promise<void> {
  // Exit flow is gated — requires explicit operator approval before any stake
  // can move. Throwing here gives the LP a clear next step instead of a
  // silent no-op (audit finding L4).
  await requireLp();
  throw new Error(
    "Exit must be initiated by Klaro operations. Email prateek@myklaro.app with subject `LP exit · <legal entity name>`.",
  );
}
