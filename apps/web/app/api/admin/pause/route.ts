import { handle } from "@/lib/api";
import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { record } from "@/lib/auditLog";
import { isLiveOnChain } from "@/lib/arcClient";
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
  record({
    actor: session.vendor.id,
    action: "contract.pause",
    subjectKind: "contract",
    subjectId: input.contract,
    reasonHash: keccak256(stringToBytes(`klaro.reason.${input.reasonCode}`)),
    noteMd: isLiveOnChain()
      ? `Operator-attempted pause via /api/admin/pause (REFUSED — on-chain wiring not yet shipped; trigger pause out-of-band)`
      : `Operator-initiated pause via /api/admin/pause (simulated — no on-chain tx)`,
  });

  if (isLiveOnChain()) {
    throw new Error(
      "pause_not_yet_wired: on-chain pause must be triggered directly against each Pausable contract until M11 wiring ships",
    );
  }

  return {
    paused: input.contract,
    at: new Date().toISOString(),
    simulated: true,
    mode: "stub" as const,
  };
});
