/**
 * Team repository — dual-mode (Supabase live · mockData fallback).
 * Maps TeamMember onto vendor_team_members. Role enum is lowercase in the DB
 * (klaro_role) and title-case in the app (TeamRole); status derives from the
 * accepted_at / removed_at timestamps.
 */
import { tryDb } from "../db";
import type { TablesInsert } from "../database.types";
import {
  mockListTeam,
  mockInviteTeammate,
  mockChangeTeamRole,
  mockRemoveTeammate,
  type TeamMember,
  type TeamRole,
} from "../mockData";

const TO_DB: Record<TeamRole, string> = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  ReadOnly: "readonly",
};
const FROM_DB: Record<string, TeamRole> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  readonly: "ReadOnly",
};

type Row = Record<string, unknown>;

function fromRow(row: Row): TeamMember {
  return {
    id: String(row.id),
    vendorId: String(row.vendor_id),
    email: String(row.email),
    role: FROM_DB[String(row.role)] ?? "Member",
    status: row.removed_at ? "REMOVED" : row.accepted_at ? "ACTIVE" : "INVITED",
    invitedAt: new Date(String(row.invited_at)),
    acceptedAt: row.accepted_at ? new Date(String(row.accepted_at)) : undefined,
  };
}

export async function listTeam(vendorId: string): Promise<TeamMember[]> {
  const c = await tryDb();
  if (!c) return mockListTeam(vendorId);
  const { data, error } = await c
    .from("vendor_team_members")
    .select("*")
    .eq("vendor_id", vendorId)
    .is("removed_at", null)
    .order("invited_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function inviteTeammate(input: {
  vendorId: string;
  email: string;
  role: TeamRole;
}): Promise<TeamMember> {
  const c = await tryDb();
  if (!c) return mockInviteTeammate(input);
  const payload = {
    vendor_id: input.vendorId,
    email: input.email,
    role: TO_DB[input.role],
  } as unknown as TablesInsert<"vendor_team_members">;
  const { data, error } = await c
    .from("vendor_team_members")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

export async function changeRole(
  id: string,
  role: TeamRole,
): Promise<TeamMember | null> {
  const c = await tryDb();
  if (!c) return mockChangeTeamRole(id, role);
  const { data, error } = await c
    .from("vendor_team_members")
    .update({ role: TO_DB[role] } as unknown as TablesInsert<"vendor_team_members">)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function removeTeammate(id: string): Promise<void> {
  const c = await tryDb();
  if (!c) return mockRemoveTeammate(id);
  const { error } = await c
    .from("vendor_team_members")
    .update({ removed_at: new Date().toISOString() } as unknown as TablesInsert<"vendor_team_members">)
    .eq("id", id);
  if (error) throw error;
}
