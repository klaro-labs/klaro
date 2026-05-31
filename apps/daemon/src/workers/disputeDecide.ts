/**
 * Operator dispute-decide worker. The web admin can't hold the operator key, so
 * the decide action enqueues here and THIS signs `DisputeManager.decide(caseId,
 * outcome, reasonHash, evidenceHash)` with the operator wallet. That emits the
 * `Decided` event → the arcSubscriber mirrors the DB + enqueues `dispute-resolve`
 * → the disputeResolver moves the escrow. Closes the loop: a product-driven
 * operator decision flows all the way to funds moving on-chain.
 *
 * Idempotent (isDecided short-circuits) + fail-safe (simulate-then-write: a
 * contract revert is a non-retryable skip, a transient error rethrows for retry).
 */
import {
  parseAbi,
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
} from "viem";
import { startWorker } from "../queue.js";
import { log } from "../log.js";
import { arcWallet, arcPublic, requireArcWalletInProd } from "../arc.js";
import { env } from "../env.js";

const DM_ABI = parseAbi([
  "function decide(bytes32 caseId, uint8 outcome, bytes32 reasonHash, bytes32 evidenceHash) external",
  "function isDecided(bytes32 caseId) view returns (bool)",
]);

// DisputeManager.Outcome enum ordinals (NONE=0). Mirror of the on-chain enum +
// the arcSubscriber DECIDED_DB_OUTCOME inverse.
export const OUTCOME_ORDINAL: Record<string, number> = {
  RELEASE_TO_CLAIMANT: 1,
  REFUND_TO_RESPONDENT: 2,
  SLASH_LP: 3,
  PENALIZE_VENDOR: 4,
  MUTUAL_RESOLVED: 5,
};

/** Map an app outcome string to its on-chain ordinal. Throws on an unknown /
 * non-deciding outcome so a bad payload surfaces loudly rather than signing
 * `decide(..., 0)` (NONE), which the contract would reject anyway. */
export function outcomeToOrdinal(outcome: string): number {
  const o = OUTCOME_ORDINAL[outcome];
  if (!o) throw new Error(`dispute_decide_bad_outcome: ${outcome}`);
  return o;
}

function isContractRevert(e: unknown): boolean {
  return (
    e instanceof BaseError &&
    e.walk((err) => err instanceof ContractFunctionRevertedError) !== null
  );
}

export interface DisputeDecideJob {
  caseId: string;
  outcome: string;
  reasonHash: string;
  evidenceHash: string;
}

/** Sign DisputeManager.decide for one case. Exported for the integration drive. */
export async function advanceDisputeDecide(
  job: DisputeDecideJob,
): Promise<void> {
  const addr = env.DISPUTE_MANAGER_ADDRESS as Hex | undefined;
  if (!addr) {
    requireArcWalletInProd(
      `disputeDecide(${job.caseId}) — DISPUTE_MANAGER_ADDRESS unset`,
    );
    log.warn("dispute.decide.no_address", { caseId: job.caseId });
    return;
  }
  const id = job.caseId as Hex;
  const ordinal = outcomeToOrdinal(job.outcome);

  // Idempotent: a re-delivered job (or a manual decide) must not re-sign.
  const already = await arcPublic().readContract({
    address: addr,
    abi: DM_ABI,
    functionName: "isDecided",
    args: [id],
  });
  if (already) {
    log.info("dispute.decide.already", { caseId: job.caseId });
    return;
  }

  const wallet = arcWallet();
  if (!wallet) {
    requireArcWalletInProd(`disputeDecide(${job.caseId})`);
    return;
  }
  const args = [
    id,
    ordinal,
    job.reasonHash as Hex,
    job.evidenceHash as Hex,
  ] as const;
  try {
    await arcPublic().simulateContract({
      address: addr,
      abi: DM_ABI,
      functionName: "decide",
      args,
      account: wallet.account!,
    });
  } catch (e) {
    if (isContractRevert(e)) {
      log.info("dispute.decide.skip_revert", {
        caseId: job.caseId,
        reason: (e as Error).message.slice(0, 180),
      });
      return; // already decided / not openable / bad context — non-retryable
    }
    throw e; // transient → retry
  }
  const hash = await wallet.writeContract({
    address: addr,
    abi: DM_ABI,
    functionName: "decide",
    args,
    chain: null,
    account: wallet.account!,
  });
  await arcPublic().waitForTransactionReceipt({ hash });
  log.info("dispute.decide.onchain", {
    caseId: job.caseId,
    outcome: job.outcome,
    hash,
  });
}

export function startDisputeDecider() {
  startWorker<DisputeDecideJob>(
    "dispute-decide",
    async (job) => {
      await advanceDisputeDecide(job.data);
    },
    2,
  );
}
