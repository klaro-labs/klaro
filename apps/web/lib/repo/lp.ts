/**
 * LP-profile repository — dual-mode (Supabase live · mockData fallback). The LP
 * write actions (apply / submit-docs / approve / stake / rotate-payout-wallet /
 * invite) wrote to `lib/mockData` only, so in live mode every LP mutation
 * silently vanished on a cold start (T1 honest-mode gap). This persists them to
 * `lp_profiles`.
 *
 * Status reconciliation: the app's `LPApplicationStatus` and the DB `lp_status`
 * enum diverge — the app has DRAFT / DOCS_UPLOADED / REJECTED that the enum
 * lacks (the enum uses APPLIED). Map both directions so a write never hits an
 * invalid-enum error and a read never surfaces an unrecognised status.
 *
 * `lp_profiles.staked_usdc` is stored in whole USDC (numeric dollars); the app
 * carries micro-USDC bigints, so divide on write and multiply on read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryDb } from "../db";
import {
  mockUpdateLP,
  mockCreateLPInvite,
  type LPApplication,
  type LPApplicationStatus,
} from "../mockData";

const lp = (c: NonNullable<Awaited<ReturnType<typeof tryDb>>>) =>
  (c as unknown as SupabaseClient).from("lp_profiles");

// Web Crypto (edge-safe) — this module is in the lib/auth import chain, which
// webpack also bundles for non-Node runtimes, so `node:crypto` can't be used.
function randHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

// DB lp_status enum: INVITED, APPLIED, UNDER_REVIEW, APPROVED, STAKED,
// SUSPENDED, REVOKED. App statuses without a 1:1 DB peer fold to the nearest.
const APP_TO_DB: Record<LPApplicationStatus, string> = {
  INVITED: "INVITED",
  DRAFT: "INVITED",
  DOCS_UPLOADED: "APPLIED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  STAKED: "STAKED",
  REJECTED: "REVOKED",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
};

export function dbStatusToApp(s: string): LPApplicationStatus {
  switch (s) {
    case "APPLIED":
      return "DOCS_UPLOADED";
    case "INVITED":
    case "UNDER_REVIEW":
    case "APPROVED":
    case "STAKED":
    case "SUSPENDED":
    case "REVOKED":
      return s as LPApplicationStatus;
    default:
      return s as LPApplicationStatus;
  }
}

type Row = Record<string, unknown>;

/** Map an `lp_profiles` row to the app's LPApplication shape. Shared with the
 * LP-membership read path so both agree on the status + amount conversions. */
export function lpRowToApplication(row: Row): LPApplication {
  return {
    lpId: String(row.lp_id),
    inviteCode: String(row.invite_code ?? ""),
    legalEntityName: row.legal_entity_name as string | undefined,
    contactEmail: String(row.contact_email),
    country: row.country as string | undefined,
    wallet: row.wallet as LPApplication["wallet"],
    tier: Number(row.tier ?? 0) as LPApplication["tier"],
    stakedUsdc: BigInt(Math.round(Number(row.staked_usdc ?? 0) * 1_000_000)),
    kybDocsHash: row.kyb_record_hash as LPApplication["kybDocsHash"],
    payoutAccountHash:
      row.payout_account_hash as LPApplication["payoutAccountHash"],
    status: dbStatusToApp(String(row.status)),
    rejectReason: row.last_reason_hash as string | undefined,
    createdAt: new Date(String(row.invited_at ?? row.updated_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

/** Apply a partial LP update, keyed by the text business id (`lp_profiles.lp_id`,
 * the value carried as `LPApplication.lpId`). Only the provided fields are
 * written. Runs under the caller's RLS client (the LP owns their profile). */
export async function updateLp(
  lpId: string,
  patch: Partial<LPApplication>,
): Promise<LPApplication | null> {
  const c = await tryDb();
  if (!c) return mockUpdateLP(lpId, patch);

  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.legalEntityName !== undefined)
    dbPatch.legal_entity_name = patch.legalEntityName;
  if (patch.country !== undefined) dbPatch.country = patch.country;
  if (patch.wallet !== undefined) dbPatch.wallet = patch.wallet;
  if (patch.status !== undefined) dbPatch.status = APP_TO_DB[patch.status];
  if (patch.kybDocsHash !== undefined)
    dbPatch.kyb_record_hash = patch.kybDocsHash;
  if (patch.payoutAccountHash !== undefined)
    dbPatch.payout_account_hash = patch.payoutAccountHash;
  if (patch.tier !== undefined) dbPatch.tier = patch.tier;
  if (patch.stakedUsdc !== undefined)
    dbPatch.staked_usdc = Number(patch.stakedUsdc) / 1_000_000;
  if (patch.status === "APPROVED")
    dbPatch.approved_at = new Date().toISOString();

  const { data, error } = await lp(c)
    .update(dbPatch)
    .eq("lp_id", lpId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? lpRowToApplication(data as Row) : null;
}

/** Operator-issued LP invite. Persists an INVITED `lp_profiles` row. The short
 * invite_code has no column in the live schema (the live invite is linked via
 * `lp_members`, not a code lookup), so it is not persisted in live mode. */
export async function createLpInvite(input: {
  contactEmail: string;
}): Promise<LPApplication> {
  const c = await tryDb();
  if (!c) return mockCreateLPInvite(input);
  const lpId = `lp_${randHex(5)}`;
  const { data, error } = await lp(c)
    .insert({
      lp_id: lpId,
      contact_email: input.contactEmail,
      tier: 0,
      staked_usdc: 0,
      status: "INVITED",
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return lpRowToApplication(data as Row);
}
