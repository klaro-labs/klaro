"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  mockInviteTeammate,
  mockChangeTeamRole,
  mockRemoveTeammate,
  mockListTeam,
  type TeamRole,
} from "@/lib/mockData";
import { requireVendor } from "@/lib/auth";

// FormData `role` was cast straight to TeamRole, so a
// posted `role="Pwned"` slipped past the `role === "Owner"` guard and
// persisted a garbage enum value. Downstream RBAC branches in
// _resolveTeammate + admin tooling assume one of these four literals
// — anything else is a permanent orphan. Same defect class as
// RCF1 (recurring frequency). Reject pre-store.
const TEAM_ROLE = z.enum(["Owner", "Admin", "Member", "ReadOnly"]);

/** Owner-or-admin gate. Members + read-only cannot mutate team. */
async function _assertCanManageTeam(): Promise<{ vendorId: string }> {
  const s = await requireVendor();
  const team = await mockListTeam(s.vendor.id);
  const self = team.find((m) => m.email === s.vendor.email);
  if (!self || (self.role !== "Owner" && self.role !== "Admin")) {
    throw new Error("Owner or Admin role required");
  }
  return { vendorId: s.vendor.id };
}

/** Resolve the target row + verify it belongs to the caller's tenant. */
async function _resolveTeammate(
  memberId: string,
): Promise<{ vendorId: string; targetRole: TeamRole }> {
  const { vendorId } = await _assertCanManageTeam();
  const team = await mockListTeam(vendorId);
  const target = team.find((m) => m.id === memberId);
  if (!target) throw new Error("teammate not found in your tenant");
  return { vendorId, targetRole: target.role };
}

export async function inviteTeammateAction(formData: FormData): Promise<void> {
  const { vendorId } = await _assertCanManageTeam();
  const email = String(formData.get("email") ?? "");
  const role = TEAM_ROLE.parse(formData.get("role") ?? "Member");
  if (!email.includes("@")) throw new Error("invalid email");
  if (role === "Owner") throw new Error("only one Owner per tenant");
  await mockInviteTeammate({ vendorId, email, role });
  revalidatePath("/vendor/team");
}

export async function changeRoleAction(
  id: string,
  role: TeamRole,
): Promise<void> {
  const { targetRole } = await _resolveTeammate(id);
  const parsed = TEAM_ROLE.parse(role);
  if (targetRole === "Owner") throw new Error("cannot change the Owner role");
  if (parsed === "Owner")
    throw new Error("Owner is set at tenant creation only");
  await mockChangeTeamRole(id, parsed);
  revalidatePath("/vendor/team");
}

export async function removeTeammateAction(id: string): Promise<void> {
  const { targetRole } = await _resolveTeammate(id);
  if (targetRole === "Owner") throw new Error("cannot remove the Owner");
  await mockRemoveTeammate(id);
  revalidatePath("/vendor/team");
}
