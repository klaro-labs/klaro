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
    throw new Error(
      "dispute_decide_not_yet_wired: operator daemon must call DisputeManager.decide on chain before the DB row flips — refusing simulated-only write while contracts are live",
    );
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
  // sibling decideDisputeAction refused in live mode
  // ( honest-label sweep); requestEvidenceAction +
  // assignToReviewAction were missed. Operator clicked "Request
  // evidence" in live mode → UI refreshed + appeared to succeed →
  // state vanished on next cold start. Same divergence pattern.
  const { isLiveOnChain } = await import("@/lib/arcClient");
  if (isLiveOnChain()) {
    throw new Error(
      "dispute_request_evidence_not_yet_persistent: mock dispute store does not survive serverless cold starts; persistent disputes ship M11",
    );
  }
  if (askFor.length < 3) throw new Error("evidence request must be specific");
  await mockAddEvidence(caseId, {
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
  // same honest-label refusal as requestEvidenceAction.
  const { isLiveOnChain } = await import("@/lib/arcClient");
  if (isLiveOnChain()) {
    throw new Error(
      "dispute_assign_review_not_yet_persistent: mock dispute store does not survive serverless cold starts; persistent disputes ship M11",
    );
  }
  await mockAssignDisputeToReview(caseId);
  auditRecord({
    actor: session.vendor.id,
    action: "dispute.assign_review",
    subjectKind: "dispute",
    subjectId: caseId,
  });
  revalidatePath("/admin/disputes");
  revalidatePath(`/vendor/disputes/${caseId}`);
}
