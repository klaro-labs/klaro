/**
 * LP membership repository — live mode reads from `lp_members` (Supabase, RLS
 * vendor-scoped); dev mode delegates to `mockGetPrimaryLpForVendor`.
 * Closes LP server actions were picking
 * `mockListLPs()[0]` for every signed-in vendor, so anyone could submit KYB
 * + stake + claim orders as the first LP in the table. With this repo, the LP
 * is derived from `(session.vendor.id → lp_members → lp_profiles)`.
 */
import { tryDb } from "../db";
import { lpRowToApplication } from "./lp";
import {
  mockGetPrimaryLpForVendor,
  mockListLpMembershipsForVendor,
  type LPApplication,
  type LPMembership,
} from "../mockData";

export async function getPrimaryLpForVendor(
  vendorId: string,
): Promise<LPApplication | null> {
  const c = await tryDb();
  if (!c) return mockGetPrimaryLpForVendor(vendorId);
  // Pull the first owner-or-operator membership joined to lp_profiles.
  const { data, error } = await c
    .from("lp_members")
    .select("lp_id, role, lp_profiles!inner(*)")
    .eq("vendor_id", vendorId)
    .in("role", ["owner", "operator"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // The supabase-js typed shape returns `lp_profiles` as the joined row.
  const lp = (data as unknown as { lp_profiles: Record<string, unknown> })
    .lp_profiles;
  return lpRowToApplication(lp);
}
// lpRowToApplication now lives in ./lp (shared with the LP write path so reads
// and writes agree on the status enum + micro-USDC conversions).

export async function listMembershipsForVendor(
  vendorId: string,
): Promise<LPMembership[]> {
  const c = await tryDb();
  if (!c) return mockListLpMembershipsForVendor(vendorId);
  const { data, error } = await c
    .from("lp_members")
    .select("vendor_id, lp_id, role")
    .eq("vendor_id", vendorId);
  if (error) throw error;
  return (data ?? []).map(
    (r): LPMembership => ({
      vendorId: String(r.vendor_id),
      lpId: String(r.lp_id),
      role: r.role as LPMembership["role"],
    }),
  );
}
