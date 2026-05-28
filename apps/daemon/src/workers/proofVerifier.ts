/**
 * Proof verifier — receives payout-proof submissions (UTR + screenshot) and
 * decides accept/reject. No verifier integration is currently configured, so
 * submitted proofs remain pending manual review and cannot advance money state.
 */
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export interface ProofJob {
  orderId: string;
  proofHash: string;
}

export function startProofVerifier() {
  startWorker<ProofJob>(
    "proof-verify",
    async (job) => {
      const { orderId, proofHash } = job.data;
      log.warn("[SIMULATED] proof.verify.manual_review_required", {
        orderId,
        proofHash,
      });
      // row update was swallowed. If it failed, DB
      // never recorded `simulated: true` but admin queue still got
      // notified — operator would chase a row that looked verified.
      // previously this update lacked a state guard. If
      // an admin manually flipped `verified_at = now(), simulated =
      // false` between the on-chain ProofSubmitted event and the worker
      // dequeue (or on any retry of a delayed job after admin action),
      // the update silently un-verified the row and downstream
      // cashout-advance:proof-verify re-enqueued admin review forever.
      // Add `.is("verified_at", null)` so manually-verified rows are
      // skipped (PostgREST returns 0 affected, no error — that's the
      // correct outcome for a now-irrelevant retry).
      const upProof = await sb()
        .from("payout_proofs")
        .update({ simulated: true, verified_at: null })
        .eq("order_id", orderId)
        .eq("proof_hash", proofHash)
        .is("verified_at", null);
      if (upProof.error) throw upProof.error;
      // deterministic jobId. Both this proof-verify
      // worker AND cashoutAdvancer's proof-verify branch enqueue
      // notify-admin with the same `proof-review:${orderId}` name.
      // Without jobId, admin received duplicate "review proof" emails
      // per stuck cashout. Same class as .
      await queue("notify-admin").add(
        `proof-review:${orderId}`,
        { orderId, proofHash, kind: "cashout.proof_review_required" },
        { jobId: `notify-admin_proof-review_${orderId}` },
      );
    },
    4,
  );
}
