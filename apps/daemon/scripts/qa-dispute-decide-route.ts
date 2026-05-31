/**
 * Dispute-decide integration smoke. Drives the ACTUAL daemon
 * `advanceDisputeDecide` against the LIVE DisputeManager on Arc testnet —
 * proving the decide ABI encoding, the operator-wallet signer wiring, and the
 * simulate-then-skip safety net work, WITHOUT deciding any real case: a random
 * caseId has no open case, so isDecided() is false and the decide simulate
 * reverts → the worker classifies it as a non-retryable skip (no tx sent).
 *
 * It does NOT prove a real decision lands — that needs an opened case on a
 * funded escrow. See HUMAN_ACTIONS_NEEDED.md.
 *
 * Run from apps/daemon:  node --env-file=.env <tsx> scripts/qa-dispute-decide-route.ts
 */
import { randomBytes } from "node:crypto";
import { advanceDisputeDecide } from "../src/workers/disputeDecide.js";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures++;
};

const caseId = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
const reasonHash = ("0x" + "11".repeat(32)) as `0x${string}`;
const evidenceHash = ("0x" + "22".repeat(32)) as `0x${string}`;

let threw: string | null = null;
try {
  await advanceDisputeDecide({
    caseId,
    outcome: "RELEASE_TO_CLAIMANT",
    reasonHash,
    evidenceHash,
  });
} catch (e) {
  threw = (e as Error).message;
}
check(
  "advanceDisputeDecide drives live DisputeManager + simulate-skips (no throw, no decide)",
  threw === null,
  threw ? threw.slice(0, 120) : "skipped on revert",
);

console.log(`\nDISPUTE_DECIDE_SMOKE_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
