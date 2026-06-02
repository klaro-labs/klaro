/**
 * On-chain reputation writes (build #3). VendorReputation is deployed + the
 * operator key is an authorized caller (onlyAuthorized = klaroOperator). The
 * read side (web arcClient.readReputationScore → ReputationManager.computeScore)
 * was already implemented but always read EMPTY because nothing ever wrote an
 * event on-chain. This helper records the event, operator-signed, at each
 * settlement point. vendorId is hashed exactly like the read side does
 * (keccak256(toBytes(vendorId))) so scores resolve.
 *
 * Best-effort: NEVER throws into the money flow — a reputation blip must not
 * block a settle/release. No-op when VENDOR_REPUTATION_ADDRESS is unset.
 */
import { parseAbi, keccak256, toBytes, type Hex } from "viem";
import { arcWallet } from "./arc.js";
import { env } from "./env.js";
import { log } from "./log.js";

const REP_ABI = parseAbi([
  "function record(bytes32 vendorId, uint8 kind, int32 weight, bytes32 evidenceHash, bytes32 reasonHash) external returns (uint256)",
]);
const ZERO = ("0x" + "00".repeat(32)) as Hex;

// Kind enum — matches VendorReputation.sol (NONE = 0).
export const REP_KIND = {
  INVOICE_SETTLED: 1,
  INVOICE_SETTLED_LATE: 2,
  CASHOUT_RELEASED: 3,
  AGENT_JOB_CLOSED: 4,
  DISPUTE_OPENED: 5,
  DISPUTE_WON: 6,
  DISPUTE_LOST: 7,
  REFUND_ISSUED: 8,
} as const;

export async function recordReputation(
  vendorId: string,
  kind: number,
  weight: number,
  evidenceHash?: Hex,
): Promise<void> {
  const addr = env.VENDOR_REPUTATION_ADDRESS;
  if (!addr || !vendorId) return;
  const wallet = arcWallet();
  if (!wallet?.account) return;
  try {
    const hash = await wallet.writeContract({
      address: addr as Hex,
      abi: REP_ABI,
      functionName: "record",
      args: [
        keccak256(toBytes(vendorId)),
        kind,
        weight,
        evidenceHash ?? ZERO,
        ZERO,
      ],
      chain: null,
      account: wallet.account,
    });
    log.info("reputation.recorded", { vendorId, kind, weight, hash });
  } catch (e) {
    log.warn("reputation.record_failed", {
      vendorId,
      kind,
      err: (e as Error).message,
    });
  }
}
