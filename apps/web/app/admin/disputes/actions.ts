"use server";

import { revalidatePath } from "next/cache";
import { keccak256, stringToBytes } from "viem";
import {
  mockAssignDisputeToReview,
  mockDecideDispute,
  mockAddEvidence,
  mockGetDispute,
  type DisputeOutcome,
} from "@/lib/mockData";
import { advanceCashout } from "@/lib/repo/cashouts";
import * as disputesRepo from "@/lib/repo/disputes";
import { requireOperator } from "@/lib/auth";
import { record as auditRecord } from "@/lib/auditLog";
import type { Hex } from "@/lib/types";

// Derived from ReasonCodes.sol — `keccak256("klaro.reason.NAME")`.
// was hardcoded placeholder hex that would have
// reverted `ReasonCodes.require_()` on-chain.
const REASON_HASHES: Record<DisputeOutcome, Hex> = {
  RELEASE_TO_CLAIMANT: keccak256(
    stringToBytes("klaro.reason.DISPUTE_AGENT_FAULT"),
  ),
  REFUND_TO_RESPONDENT: keccak256(
    stringToBytes("klaro.reason.DISPUTE_USER_FAULT"),
  ),
  SLASH_LP: keccak256(stringToBytes("klaro.reason.SLASH_LP_BAD_PROOF")),
  PENALIZE_VENDOR: keccak256(
    stringToBytes("klaro.reason.PENALIZE_VENDOR_FRAUD"),
  ),
  MUTUAL_RESOLVED: keccak256(
    stringToBytes("klaro.reason.DISPUTE_MUTUAL_RESOLVED"),
  ),
};

function _hash(input: string): Hex {
  return keccak256(stringToBytes(input));
}

export async function decideDisputeAction(
  caseId: Hex,
  outcome: DisputeOutcome,
  note: string,
): Promise<void> {
  const session = await requireOperator();
  if (note.length < 10) throw new Error("decision note must explain reasoning");
  // action writes to in-memory
  // dispute store + flips cashout DB row. No tx fires against the
  // DisputeManager contract — in live mode the chain says DISPUTED
  // while the DB says RESOLVED_VENDOR_PAYS. Refuse in live mode until
  // the operator daemon wires `DisputeManager.decide` + the
  // downstream `CashoutOrderProcessor.resolveDispute` call (
  // closed the on-chain side; off-chain operator caller is still
  // pending). Simulated mode keeps working so M1 demos render.
  const { isLiveOnChain } = await import("@/lib/arcClient");
  if (isLiveOnChain()) {
    // Live: the web can't hold the operator key, so hand the decision to the
    // daemon, which signs `DisputeManager.decide` on-chain. The resulting
    // `Decided` event drives the DB mirror (arcSubscriber) + the escrow
    // resolution (disputeResolver) — proof beats claims, the DB never leads the
    // chain. Validate the cashout-outcome constraint up front; the contract
    // re-checks context on resolve.
    const live = await disputesRepo.getDispute(caseId);
    if (!live) throw new Error("dispute not found");
    if (
      live.context === "cashout" &&
      outcome !== "RELEASE_TO_CLAIMANT" &&
      outcome !== "REFUND_TO_RESPONDENT" &&
      outcome !== "SLASH_LP"
    ) {
      throw new Error("outcome cannot resolve a cashout dispute");
    }
    const reasonHash = REASON_HASHES[outcome];
    const evidenceHash = _hash(note);
    const { createQueue } = await import("@/lib/queue");
    const decideQueue = createQueue<{
      caseId: Hex;
      outcome: DisputeOutcome;
      reasonHash: Hex;
      evidenceHash: Hex;
    }>(
      "dispute-decide",
      // The real worker (signs DisputeManager.decide) runs in the daemon; this
      // inline body is only hit in dev inline-mode, where isLiveOnChain() is
      // false so this branch isn't reached.
      async () => {},
    );
    await decideQueue.enqueue(
      { caseId, outcome, reasonHash, evidenceHash },
      { idempotencyKey: `dispute-decide:${caseId}` },
    );
    auditRecord({
      actor: session.vendor.id,
      action: "dispute.decide",
      subjectKind: "dispute",
      subjectId: caseId,
      reasonHash,
      noteMd: `Operator decision ${outcome} enqueued for on-chain DisputeManager.decide`,
      runbookId: "dispute-overdue",
    });
    revalidatePath("/admin/disputes");
    return;
  }
  const dispute = await mockGetDispute(caseId);
  if (!dispute) throw new Error("dispute not found");
  if (
    dispute.context === "cashout" &&
    outcome !== "RELEASE_TO_CLAIMANT" &&
    outcome !== "REFUND_TO_RESPONDENT" &&
    outcome !== "SLASH_LP"
  ) {
    throw new Error("outcome cannot resolve a cashout dispute");
  }
  const reasonHash = REASON_HASHES[outcome];
  await mockDecideDispute(caseId, outcome, note, reasonHash);
  if (dispute.context === "cashout") {
    const vendorKeepsFunds =
      outcome === "RELEASE_TO_CLAIMANT" || outcome === "SLASH_LP";
    await advanceCashout(
      dispute.contextRefId,
      vendorKeepsFunds ? "RESOLVED_VENDOR_PAYS" : "RESOLVED_LP_PAYS",
      {
        kind: "resolved",
        at: new Date(),
        detail: `Simulated admin decision recorded: ${outcome}`,
      },
      undefined,
      "DISPUTED",
    );
    revalidatePath("/vendor/cashout");
    revalidatePath(`/vendor/cashout/${dispute.contextRefId}`);
  }
  auditRecord({
    actor: session.vendor.id,
    action: "dispute.decide",
    subjectKind: "dispute",
    subjectId: caseId,
    reasonHash,
    noteMd: note,
    runbookId: "dispute-overdue",
  });
  revalidatePath("/admin/disputes");
  revalidatePath(`/vendor/disputes/${caseId}`);
  revalidatePath("/lp/disputes");
}

export async function requestEvidenceAction(
  caseId: Hex,
  askFor: string,
): Promise<void> {
  const session = await requireOperator();
  // #9: persist through the dual-mode repo (Supabase live, mock fallback) — the
  // disputes/dispute_evidence tables + RLS already exist (0032/0014). Previously
  // this threw in live mode while decideDisputeAction was already wired.
  if (askFor.length < 3) throw new Error("evidence request must be specific");
  await disputesRepo.addEvidence(caseId, {
    by: "operator",
    at: new Date(),
    note: `Operator requested: ${askFor}`,
    hash: _hash(askFor),
  });
  auditRecord({
    actor: session.vendor.id,
    action: "dispute.request_evidence",
    subjectKind: "dispute",
    subjectId: caseId,
    noteMd: askFor,
  });
  revalidatePath("/admin/disputes");
  revalidatePath(`/vendor/disputes/${caseId}`);
}

export async function assignToReviewAction(caseId: Hex): Promise<void> {
  const session = await requireOperator();
  // #9: dual-mode repo (Supabase live, mock fallback) — see requestEvidenceAction.
  await disputesRepo.assignToReview(caseId);
  auditRecord({
    actor: session.vendor.id,
    action: "dispute.assign_review",
    subjectKind: "dispute",
    subjectId: caseId,
  });
  revalidatePath("/admin/disputes");
  revalidatePath(`/vendor/disputes/${caseId}`);
}
