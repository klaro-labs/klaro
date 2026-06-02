import { handle } from "@/lib/api";
import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { record } from "@/lib/auditLog";
import { isLiveOnChain } from "@/lib/arcClient";
import { setContractsPaused, adminPauseLive } from "@/lib/adminChain";
import { keccak256, stringToBytes } from "viem";

/** ReasonCodes that map 1:1 to packages/contracts/src/lib/ReasonCodes.sol.
 * Audit fix (loop ): previous version accepted any `reasonCode` string,
 * hashed it, and persisted to audit log — so an operator could write garbage
 * hashes that no consumer can reverse-lookup. Locked to the canonical set. */
const REASON_CODES = [
  "HOLD_SUSPICIOUS",
  "HOLD_SCREENING_FAIL",
  "HOLD_HIGH_RISK_VENDOR",
  "HOLD_VENDOR_KYB_PENDING",
  "REFUND_PROOF_MISSING",
  "REFUND_VENDOR_REQUEST",
  "REFUND_DUPLICATE_PAY",
  "REFUND_BUYER_DISPUTE",
  "SLASH_LP_TIMEOUT",
  "SLASH_LP_BAD_PROOF",
  "SLASH_LP_DISPUTE_LOSS",
  "SLASH_LP_KYB_REVOKED",
  "PENALIZE_VENDOR_FRAUD",
  "PENALIZE_VENDOR_CHARGEBACK",
  "DISPUTE_AGENT_FAULT",
  "DISPUTE_USER_FAULT",
  "DISPUTE_INSUFFICIENT_EV",
  "DISPUTE_MUTUAL_RESOLVED",
  "PAUSE_EMERGENCY",
  "PAUSE_PARTNER_OUTAGE",
  "PAUSE_MAINTENANCE",
  "KILL_FRAUD",
  "KILL_REGULATORY",
  "OTHER",
] as const;

const Req = z.object({
  contract: z.enum(["all", "invoice", "cashout", "agent", "retainer", "fx"]),
  reasonCode: z.enum(REASON_CODES),
  action: z.enum(["pause", "unpause"]).default("pause"),
});

export const POST = handle(Req, async (input) => {
  const session = await requireOperator();
  // previously returned `{ paused }`
  // unconditionally — no on-chain `pause()` call was ever made. In live
  // mode that gave operators false confidence during an incident: green
  // confirmation while escrows continued accepting tx. Now: in live
  // mode REFUSE with a loud 503-equivalent so the operator triggers the
  // out-of-band pause path; in simulated mode, attach `simulated: true`
  // so the admin UI can render an honest "demo only" banner. Audit log
  // entry records the intent in either case so the operator's action is
  // traceable.
  const reasonHash = keccak256(
    stringToBytes(`klaro.reason.${input.reasonCode}`),
  );

  // Live on-chain (#7): sign pause()/unpause() over the targeted Pausable
  // contracts with the operator/owner key. Each call is idempotent + isolated.
  if (isLiveOnChain() && adminPauseLive()) {
    const results = await setContractsPaused(input.contract, input.action);
    record({
      actor: session.vendor.id,
      action: input.action === "pause" ? "contract.pause" : "contract.unpause",
      subjectKind: "contract",
      subjectId: input.contract,
      reasonHash,
      noteMd: `On-chain ${input.action} via /api/admin/pause: ${results
        .map((r) => `${r.address.slice(0, 8)}…=${r.status}`)
        .join(", ")}`,
    });
    return {
      contract: input.contract,
      action: input.action,
      at: new Date().toISOString(),
      results,
    };
  }

  // Live mode but no admin signing key configured → fail loud (don't pretend).
  if (isLiveOnChain()) {
    record({
      actor: session.vendor.id,
      action: "contract.pause",
      subjectKind: "contract",
      subjectId: input.contract,
      reasonHash,
      noteMd: `Pause REFUSED — ADMIN_PAUSE_PRIVATE_KEY not configured`,
    });
    throw new Error(
      "pause_not_configured: set ADMIN_PAUSE_PRIVATE_KEY (the contract owner key) to enable on-chain pause",
    );
  }

  // Simulated (no live chain) — honest demo response.
  record({
    actor: session.vendor.id,
    action: "contract.pause",
    subjectKind: "contract",
    subjectId: input.contract,
    reasonHash,
    noteMd: `Operator-initiated ${input.action} via /api/admin/pause (simulated — no on-chain tx)`,
  });
  return {
    paused: input.contract,
    at: new Date().toISOString(),
    simulated: true,
    mode: "stub" as const,
  };
});
