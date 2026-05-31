/**
 * Dispute → escrow fan-out worker. After DisputeManager emits `Decided` (the
 * arcSubscriber mirrors the DB row + enqueues here), this routes the decided
 * case to the right escrow contract's `resolveDispute` and signs it with the
 * operator wallet so the funds actually move — closing the gap where a decided
 * dispute updated the DB + alerted an admin but never released escrow.
 *
 * Only the two DETERMINISTIC outcomes are auto-resolved on-chain:
 *   RELEASE_TO_CLAIMANT / REFUND_TO_RESPONDENT
 * because each escrow's `resolveDispute` re-derives them from DisputeManager
 * (the daemon supplies no policy number it could get wrong). SLASH_LP and
 * PENALIZE_VENDOR need an operator-set slash/penalty amount (no on-chain
 * default, none stored in `disputes`), so they route to an admin instead of the
 * daemon guessing. MUTUAL_RESOLVED has no escrow transfer to execute.
 *
 * Routing by context:
 *   agent   → AgentEscrow.resolveDispute(jobId, payToAgent)        — payToAgent
 *             derived authoritatively from chain (claimant==agent)
 *   cashout → CashoutOrderProcessor.resolveDispute(cashoutId, 0, reasonHash)
 *   stream  → RetainerStream.resolveDispute(streamId)
 * The `caseId` IS the escrow's context ref id (jobId/cashoutId/streamId) — the
 * escrows key DisputeManager lookups by it — so it is passed straight through.
 * Each escrow also re-checks its own context, so a mis-routed id reverts rather
 * than mis-paying.
 */
import {
  parseAbi,
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
} from "viem";
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcWallet, arcPublic, requireArcWalletInProd } from "../arc.js";
import { env } from "../env.js";
import { planDisputeResolution } from "./disputeRouting.js";

export { planDisputeResolution } from "./disputeRouting.js";
export type { ResolvePlan } from "./disputeRouting.js";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const AGENT_ABI = parseAbi([
  "function resolveDispute(bytes32 jobId, bool payToAgent) external",
  "function jobs(bytes32) view returns (address principal, bytes32 agentId, address agent, address token, uint256 amountUsdc, uint256 feeUsdc, bytes32 deliverableHash, uint8 status, address hook, uint64 createdAt, uint64 fundedAt, uint64 startedAt, uint64 completedAt)",
]);
const CASHOUT_ABI = parseAbi([
  "function resolveDispute(bytes32 cashoutId, uint256 slashAmount, bytes32 reasonHash) external",
]);
const STREAM_ABI = parseAbi([
  "function resolveDispute(bytes32 streamId) external",
]);
const DISPUTE_MGR_ABI = parseAbi([
  "function getCase(bytes32) view returns ((address claimant, address respondent, bytes32 context, bytes32 contextRefId, bytes32 openingEvidenceHash, bytes32 latestEvidenceHash, bytes32 decisionEvidenceHash, bytes32 decisionReasonHash, uint8 status, uint8 outcome, uint64 openedAt, uint64 decidedAt))",
]);

function addressFor(
  target: "agent" | "cashout" | "stream",
): string | undefined {
  if (target === "agent") return env.AGENT_ESCROW_ADDRESS;
  if (target === "cashout") return env.CASHOUT_ORDER_PROCESSOR_ADDRESS;
  return env.RETAINER_STREAM_ADDRESS;
}

/** True iff the thrown error is an on-chain contract revert (vs a transient RPC
 * error). A revert here means the resolution is non-retryable — already
 * resolved, not in DISPUTED state, or an outcome mismatch — so the worker logs
 * it and returns instead of looping; a transient error rethrows so BullMQ
 * retries. Fails safe: a wrong `payToAgent` reverts (OutcomeMismatch) and never
 * moves funds. */
function isContractRevert(e: unknown): boolean {
  return (
    e instanceof BaseError &&
    e.walk((err) => err instanceof ContractFunctionRevertedError) !== null
  );
}

/** Derive AgentEscrow's `payToAgent` from chain truth, mirroring the contract:
 * RELEASE_TO_CLAIMANT pays the claimant, REFUND_TO_RESPONDENT pays the other
 * party; payToAgent is whether the paid party is the job's agent. */
async function derivePayToAgent(
  jobId: Hex,
  outcome: string,
  agentAddr: Hex,
): Promise<boolean> {
  const dm = env.DISPUTE_MANAGER_ADDRESS as Hex;
  const c = await arcPublic().readContract({
    address: dm,
    abi: DISPUTE_MGR_ABI,
    functionName: "getCase",
    args: [jobId],
  });
  const claimantIsAgent = c.claimant.toLowerCase() === agentAddr.toLowerCase();
  return outcome === "RELEASE_TO_CLAIMANT" ? claimantIsAgent : !claimantIsAgent;
}

/** Simulate then send. A simulate-time contract revert is treated as an
 * idempotent / non-retryable skip (no tx sent, no funds moved); anything else
 * rethrows for BullMQ retry. */
async function simulateThenWrite(
  addr: Hex,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any,
  fn: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  ctx: { caseId: string; target: string },
): Promise<void> {
  const wallet = arcWallet();
  if (!wallet) {
    requireArcWalletInProd(`disputeResolver.${ctx.target}(${ctx.caseId})`);
    return;
  }
  try {
    await arcPublic().simulateContract({
      address: addr,
      abi,
      functionName: fn,
      args,
      account: wallet.account!,
    });
  } catch (e) {
    if (isContractRevert(e)) {
      log.info("dispute.resolve.skip_revert", {
        ...ctx,
        reason: (e as Error).message.slice(0, 180),
      });
      return;
    }
    throw e; // transient → retry
  }
  const hash = await wallet.writeContract({
    address: addr,
    abi,
    functionName: fn,
    args,
    chain: null,
    account: wallet.account!,
  });
  await arcPublic().waitForTransactionReceipt({ hash });
  log.info("dispute.resolve.onchain", { ...ctx, hash });
}

/** Resolve one decided dispute by its on-chain case id. Idempotent: a second
 * pass over an already-resolved escrow simulates-reverts and skips. */
export async function advanceDisputeResolution(caseId: string): Promise<void> {
  const { data: dispute, error } = await sb()
    .from("disputes")
    .select("case_id, source, outcome, decision_reason_hash")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;
  if (!dispute) {
    log.warn("dispute.resolve.no_row", { caseId });
    return;
  }

  const plan = planDisputeResolution(dispute.source, dispute.outcome);
  if (plan.action === "skip") {
    log.info("dispute.resolve.skip", { caseId, reason: plan.reason });
    return;
  }
  if (plan.action === "manual") {
    log.info("dispute.resolve.manual", { caseId, reason: plan.reason });
    await queue("notify-admin").add(
      caseId,
      {
        kind: "dispute.manual_resolution_required",
        detail: {
          caseId,
          source: dispute.source,
          outcome: dispute.outcome,
          reason: plan.reason,
        },
      },
      { jobId: `notify-admin_dispute-manual_${caseId}` },
    );
    return;
  }

  const addr = addressFor(plan.target) as Hex | undefined;
  if (!addr) {
    // A decided dispute whose escrow address isn't configured can't be
    // resolved on-chain. In prod this is a real misconfig (funds stuck) →
    // fail loud; in dev it's an unwired contract → surface + stop.
    requireArcWalletInProd(
      `disputeResolver.${plan.target}(${caseId}) — address unset`,
    );
    log.warn("dispute.resolve.no_address", { caseId, target: plan.target });
    return;
  }

  const id = caseId as Hex;
  const outcome = dispute.outcome as string;
  const ctx = { caseId, target: plan.target };

  if (plan.target === "stream") {
    await simulateThenWrite(addr, STREAM_ABI, "resolveDispute", [id], ctx);
    return;
  }
  if (plan.target === "cashout") {
    const reasonHash = (dispute.decision_reason_hash ?? ZERO_BYTES32) as Hex;
    await simulateThenWrite(
      addr,
      CASHOUT_ABI,
      "resolveDispute",
      [id, 0n, reasonHash],
      ctx,
    );
    return;
  }
  // agent: derive payToAgent from chain truth. viem returns the multi-value
  // `jobs` accessor as a positional tuple; `agent` is index 2 (see AGENT_ABI).
  const job = await arcPublic().readContract({
    address: addr,
    abi: AGENT_ABI,
    functionName: "jobs",
    args: [id],
  });
  const agentAddr = job[2] as Hex;
  const payToAgent = await derivePayToAgent(id, outcome, agentAddr);
  await simulateThenWrite(
    addr,
    AGENT_ABI,
    "resolveDispute",
    [id, payToAgent],
    ctx,
  );
}

export interface DisputeResolveJob {
  caseId: string;
}

export function startDisputeResolver() {
  startWorker<DisputeResolveJob>(
    "dispute-resolve",
    async (job) => {
      await advanceDisputeResolution(job.data.caseId);
    },
    3,
  );
}
