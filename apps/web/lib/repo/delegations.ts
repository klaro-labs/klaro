/**
 * Session-key (delegation) repository — dual-mode (Supabase live · mockData
 * fallback). Persists the delegation RECORD to `session_keys` (0040) so an
 * issued key survives a cold start in live mode. The Circle Modular Wallet /
 * ERC-6900 on-chain enforcement is partner-pending — a stored key does not yet
 * grant the delegate authority; the page labels that honestly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryDb } from "../db";
import {
  mockListSessionKeys,
  mockCreateSessionKey,
  mockGetSessionKey,
  mockRevokeSessionKey,
  type SessionKey,
  type SessionScope,
} from "../mockData";
import type { Hex } from "../types";

// `session_keys` is new (0040) and not in the generated Database type yet, so
// reach it through the untyped client surface.
const sk = (c: NonNullable<Awaited<ReturnType<typeof tryDb>>>) =>
  (c as unknown as SupabaseClient).from("session_keys");

type Row = Record<string, unknown>;
function fromRow(row: Row): SessionKey {
  return {
    id: String(row.id),
    vendorId: String(row.vendor_id),
    delegateAddress: String(row.delegate_address) as Hex,
    label: String(row.label),
    scope: String(row.scope) as SessionScope,
    expiresAt: new Date(String(row.expires_at)),
    createdAt: new Date(String(row.created_at)),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)) : undefined,
  };
}

export async function listSessionKeys(vendorId: string): Promise<SessionKey[]> {
  const c = await tryDb();
  if (!c) return mockListSessionKeys(vendorId);
  const { data, error } = await sk(c)
    .select("*")
    .eq("vendor_id", vendorId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getSessionKey(id: string): Promise<SessionKey | null> {
  const c = await tryDb();
  if (!c) return mockGetSessionKey(id);
  const { data, error } = await sk(c).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function createSessionKey(input: {
  vendorId: string;
  delegateAddress: Hex;
  label: string;
  scope: SessionScope;
  ttlHours: number;
}): Promise<SessionKey> {
  const c = await tryDb();
  if (!c) return mockCreateSessionKey(input);
  const expiresAt = new Date(Date.now() + input.ttlHours * 3_600_000);
  const { data, error } = await sk(c)
    .insert({
      vendor_id: input.vendorId,
      delegate_address: input.delegateAddress,
      label: input.label,
      scope: input.scope,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/** Revoke a delegation the vendor owns (sets revoked_at; RLS + the explicit
 * vendor_id match both gate it to the owner). */
export async function revokeSessionKey(
  id: string,
  vendorId: string,
): Promise<void> {
  const c = await tryDb();
  if (!c) return void mockRevokeSessionKey(id);
  const { error } = await sk(c)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("vendor_id", vendorId);
  if (error) throw error;
}
