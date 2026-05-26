/**
 * Vendor repository — dual-mode.
 * `getVendorBySupabaseUserId` is the seam used by `lib/auth.ts` getCurrentSession
 * to resolve auth.uid() → Vendor row.
 */
import { tryDb } from "../db";
import type { DbVendor } from "../dbTypes";
import { mockGetCurrentVendor } from "../mockData";
import type { Hex, Vendor } from "../types";

function fromRow(row: DbVendor): Vendor {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    country: row.country ?? undefined,
    // previously coerced null → "0x000…0" sentinel,
    // letting every UI consumer silently render the zero address as
    // the vendor's real wallet. Now: pass through null so consumers
    // either guard via assertVendorWalletProvisioned (action paths)
    // or render a clear "Not yet provisioned" state (display paths).
    wallet: (row.wallet ?? null) as Hex | null,
    createdAt: new Date(row.created_at),
    brandColor: row.brand_color ?? undefined,
    brandLogoUrl: row.brand_logo_url ?? undefined,
    invoiceTemplateVersion: row.invoice_template_version,
  } as Vendor;
}

export async function getVendorBySupabaseUserId(
  uid: string,
): Promise<Vendor | null> {
  const c = await tryDb();
  if (!c) return mockGetCurrentVendor();
  const { data, error } = await c
    .from("vendors")
    .select("*")
    .eq("supabase_user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbVendor) : null;
}

/// get-or-auto-provision the vendor row for a signed-in
/// Supabase user. Migration 0017 installs a handle_new_user() trigger that
/// inserts the row at auth.users INSERT time; this helper is the
/// defense-in-depth fallback for either (a) projects where the migration
/// hasn't run yet OR (b) the post-signup window before the trigger fires.
/// Without this, 's strict session refusal loops first-time
/// signups back to /signin forever.
export async function getOrAutoProvisionVendor(
  uid: string,
  email: string,
): Promise<Vendor | null> {
  const existing = await getVendorBySupabaseUserId(uid);
  if (existing) return existing;
  const c = await tryDb();
  if (!c) return mockGetCurrentVendor();
  const localPart = email.split("@")[0] || "vendor";
  const insert = await c
    .from("vendors")
    .insert({
      supabase_user_id: uid,
      email,
      display_name: localPart,
    })
    .select()
    .single();
  if (insert.error) {
    // Trigger may have just won the race; re-read.
    const winnerRow = await getVendorBySupabaseUserId(uid);
    if (winnerRow) return winnerRow;
    // F-5 (web audit): postgres 23505 on the email column
    // means a DIFFERENT auth.users row already claimed this email
    // (e.g. Google + magic-link signups for the same address — both
    // produce distinct `auth.uid` but the citext-unique email rejects
    // the second insert). The original trigger's
    // `on conflict (email) do nothing` swallowed silently, leaving
    // user 2 stuck. Surface a clean error instead of leaking the raw
    // PostgREST message + column hints.
    const code = (insert.error as { code?: string }).code;
    if (code === "23505") {
      // F-1 (web audit): prefix with `validation_` so handle()'s
      // `/^validation|invalid/i` classifier maps this to 400, not 500.
      // (Without the prefix the friendly text fell through to
      // `internal_error` and the user saw a generic 500.)
      throw new Error(
        "validation_email_already_claimed: this email is already linked to another Klaro account; sign in with the original provider or contact support",
      );
    }
    throw insert.error;
  }
  return fromRow(insert.data as DbVendor);
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  const c = await tryDb();
  if (!c) return mockGetCurrentVendor();
  const { data, error } = await c
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbVendor) : null;
}

export async function updateVendorBranding(
  vendorId: string,
  patch: {
    brandColor?: string | null;
    brandLogoUrl?: string | null;
    displayName?: string;
  },
): Promise<void> {
  const c = await tryDb();
  if (!c) return; // mock side already updates in-memory via separate path
  const update: Record<string, unknown> = {};
  if (patch.brandColor !== undefined) update.brand_color = patch.brandColor;
  if (patch.brandLogoUrl !== undefined)
    update.brand_logo_url = patch.brandLogoUrl;
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (Object.keys(update).length === 0) return;
  // Bump template version on any branding change so future receipts pin the new look.
  const cur = await c
    .from("vendors")
    .select("invoice_template_version")
    .eq("id", vendorId)
    .single();
  if (cur.error) throw cur.error;
  update.invoice_template_version =
    (cur.data?.invoice_template_version ?? 1) + 1;
  const { error } = await c.from("vendors").update(update).eq("id", vendorId);
  if (error) throw error;
}
