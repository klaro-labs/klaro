"use server";

import { revalidatePath } from "next/cache";
import { keccak256, toBytes } from "viem";
import { requireLp } from "@/lib/auth";
import { addEvidence, getDispute } from "@/lib/repo/disputes";
import { getCashout } from "@/lib/repo/cashouts";
import { record as auditRecord } from "@/lib/auditLog";
import type { Hex } from "@/lib/types";

/// action was permissionless. Any
/// anonymous POST could write "respondent" evidence onto any open dispute,
/// poisoning every other vendor's case file. Now: requireLp + verify the
/// case is a cashout dispute owned by this LP (via the cashout's lpId).
/// Evidence hash switched from the broken pad-and-truncate sham to a real
/// keccak256 digest so two notes sharing a prefix no longer collide.
export async function lpDefendAction(caseId: Hex, note: string): Promise<void> {
  const { vendor, lp } = await requireLp();
  if (note.length < 5) throw new Error("defense_note_required");

  const c = await getDispute(caseId);
  if (!c) throw new Error("case_not_found");
  if (c.context !== "cashout") throw new Error("not_lp_defended_case");

  const cashout = await getCashout(c.contextRefId);
  if (!cashout || cashout.lpId !== lp.lpId) {
    throw new Error("not_assigned_lp");
  }

  await addEvidence(caseId, {
    by: "respondent",
    at: new Date(),
    note,
    hash: keccak256(toBytes(note)),
  });
  auditRecord({
    actor: vendor.id,
    action: "lp.dispute.defend",
    subjectKind: "dispute",
    subjectId: caseId,
    evidenceHash: keccak256(toBytes(note)),
    noteMd: `LP ${lp.lpId} submitted respondent evidence.`,
  });
  revalidatePath("/lp/disputes");
  revalidatePath("/admin/disputes");
  revalidatePath(`/vendor/disputes/${caseId}`);
}
