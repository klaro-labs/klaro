/**
 * Cashout advancer worker — moves cashout orders through their state machine.
 * Triggered by ArcEventListener on OrderClaimed/ProofSubmitted events + by
 * scheduler for quote-expiry checks.
 */
import { parseAbi, keccak256, toHex, type Hex } from "viem";
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcWallet, arcPublic, requireArcWalletInProd } from "../arc.js";
import { env } from "../env.js";

// previously called `confirmReceived(bytes32)` which is
// vendor-only. The daemon's operator wallet is NOT the vendor → contract
// reverts NotVendor → 5 BullMQ retries → DLQ → USDC stuck. added
// `operatorConfirmReceived(bytes32, address expectedVendor)` to the
// contract: onlyOperator + validates the expected vendor matches the
// recorded order vendor (defense-in-depth on operator-key compromise).
//
// LF-3 end-to-end: the vendor-side web action escrows USDC via
// `requestAndLock` (order → LOCKED on-chain), but `match-lp` and
// `proof-verify` previously only mirrored the DB and NEVER advanced the
// escrow. The on-chain state machine is strict:
//   LOCKED --claimByLP--> CLAIMED --recordProof--> PROOF_SUBMITTED
//          --operatorConfirmReceived--> RELEASED (USDC → LP)
// so `operatorConfirmReceived` in the release branch always reverted
// `InvalidStatus(PROOF_SUBMITTED, LOCKED)` → DLQ → vendor USDC stranded.
// `claimByLP` + `recordProof` (added below) close the two missing legs so
// the release leg the daemon already signs can actually succeed.
// exported so the cashout daemon-leg integration drive
// (scripts/qa-cashout-daemon-legs) can exercise the EXACT operator calls the
// worker signs against the live deployment.
export const CASHOUT_ABI = parseAbi([
  "function confirmReceived(bytes32 cashoutId) external",
  "function operatorConfirmReceived(bytes32 cashoutId, address expectedVendor) external",
  "function claimByLP(bytes32 cashoutId, bytes32 lpId) external",
  "function recordProof(bytes32 cashoutId, (bytes32 cashoutId, bytes32 lpId, bytes32 vendorId, uint256 inrAmount, uint256 usdcAmount, bytes32 utrReferenceHash, bytes32 screenshotHash, uint64 submittedAt, bytes32 lpSignatureHash, bytes32 verifierSignatureHash) p) external",
  "function getOrder(bytes32 cashoutId) view returns ((address vendor, address token, uint256 usdcAmount, uint256 klaroFee, uint256 inrAmount, bytes32 lpId, address lpWallet, bytes32 corridor, uint64 requestedAt, uint64 quoteExpiresAt, bytes32 quoteHash, bytes32 proofHash, uint8 status))",
]);

// CashoutOrderProcessor.Status enum ordinals (must mirror the Solidity enum
// order in CashoutOrderProcessor.sol). Used for idempotent state-machine
// guards on the on-chain order before signing an advancing tx.
export const ON_CHAIN_STATUS = {
  NONE: 0,
  REQUESTED: 1,
  LOCKED: 2,
  CLAIMED: 3,
  PROOF_SUBMITTED: 4,
  CONFIRMED: 5,
  RELEASED: 6,
} as const;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

/** Read the on-chain order status ordinal (NONE=0 when no order exists). */
export async function onChainOrder(addr: string, cashoutId: string) {
  return arcPublic().readContract({
    address: addr as Hex,
    abi: CASHOUT_ABI,
    functionName: "getOrder",
    args: [cashoutId as Hex],
  });
}

/**
 * match-lp on-chain leg: assign the chosen LP to the escrowed order
 * (LOCKED → CLAIMED). Operator-signed. Idempotent + tolerant of legacy
 * DB-only orders:
 *  - on-chain CLAIMED already → no-op (a BullMQ retry after a DB-write
 *    failure must not re-`claimByLP`, which would revert InvalidStatus).
 *  - on-chain NONE → order was never escrowed on-chain (pre-LF-3 / mock
 *    row); skip the chain leg and let the DB mirror advance alone.
 *  - on-chain LOCKED → sign `claimByLP`.
 *  - anything else → throw (unexpected; surfaces loudly, no silent skip).
 * `preferredLpId` is `lp_profiles.lp_id`, which the schema documents as the
 * on-chain bytes32 LP id; the contract re-checks `registry.assertActive`.
 *
 * Returns the LP id that is now authoritative on-chain so the caller mirrors
 * the DB to whatever was actually claimed. On a retry that finds the order
 * already CLAIMED, the on-chain `lpId` wins over a freshly re-selected
 * candidate (the pool may have shifted between attempts) — the escrow will
 * only ever pay the wallet snapshotted at claim time, so the DB must agree.
 */
export async function advanceClaimOnChain(
  cashoutId: string,
  preferredLpId: string,
): Promise<string> {
  const wallet = arcWallet();
  const addr = env.CASHOUT_ORDER_PROCESSOR_ADDRESS;
  if (!wallet || !addr) {
    // No signer/address. In production this must fail loud — a configured
    // cashout deployment with no operator signer would strand vendor USDC.
    requireArcWalletInProd(`cashoutAdvancer.match-lp(${cashoutId})`);
    return preferredLpId; // dev with no chain wiring: DB-only mirror
  }
  const o = await onChainOrder(addr, cashoutId);
  const status = Number(o.status);
  if (status === ON_CHAIN_STATUS.CLAIMED) return o.lpId; // already claimed → on-chain wins
  if (status === ON_CHAIN_STATUS.NONE) {
    log.warn("cashout.claim.no_onchain_order", { cashoutId });
    return preferredLpId;
  }
  if (status !== ON_CHAIN_STATUS.LOCKED) {
    throw new Error(
      `cashout_claim_bad_status: cashoutId=${cashoutId} on-chain status=${status} (expected LOCKED)`,
    );
  }
  const hash = await wallet.writeContract({
    address: addr as Hex,
    abi: CASHOUT_ABI,
    functionName: "claimByLP",
    args: [cashoutId as Hex, preferredLpId as Hex],
    chain: null,
    account: wallet.account!,
  });
  await arcPublic().waitForTransactionReceipt({ hash });
  log.info("cashout.claim.onchain", { cashoutId, lpId: preferredLpId, hash });
  return preferredLpId;
}

/**
 * proof-verify on-chain leg: anchor the verified payout proof + advance the
 * escrow (CLAIMED → PROOF_SUBMITTED) so the release leg's
 * `operatorConfirmReceived` can succeed. Operator-signed. Idempotent via
 * on-chain status, same legacy/dev tolerance as the claim leg.
 *
 * The amounts + lpId in the anchored proof are read from the on-chain order
 * (canonical) rather than the DB to avoid mirror drift; the UTR + screenshot
 * hashes come from the off-chain `payout_proofs` row. `vendorId` is the
 * keccak of the Supabase vendor id (ProofRegistry documents vendorId as the
 * off-chain Supabase identity) — non-zero, so it satisfies the contract's
 * `VendorMissing` guard. `submittedAt` is ignored on-chain (the contract
 * stamps `block.timestamp`).
 */
export async function advanceProofOnChain(
  cashoutId: string,
  db: {
    vendorId: string;
    utrReference: string | null;
    screenshotPath: string | null;
    proofHash: string;
  },
): Promise<void> {
  const wallet = arcWallet();
  const addr = env.CASHOUT_ORDER_PROCESSOR_ADDRESS;
  if (!wallet || !addr) {
    requireArcWalletInProd(`cashoutAdvancer.proof-verify(${cashoutId})`);
    return;
  }
  const o = await onChainOrder(addr, cashoutId);
  const status = Number(o.status);
  if (status === ON_CHAIN_STATUS.PROOF_SUBMITTED) return;
  if (status === ON_CHAIN_STATUS.NONE) {
    log.warn("cashout.proof.no_onchain_order", { cashoutId });
    return;
  }
  if (status !== ON_CHAIN_STATUS.CLAIMED) {
    throw new Error(
      `cashout_proof_bad_status: cashoutId=${cashoutId} on-chain status=${status} (expected CLAIMED)`,
    );
  }
  const proof = {
    cashoutId: cashoutId as Hex,
    lpId: o.lpId,
    vendorId: keccak256(toHex(db.vendorId)),
    inrAmount: o.inrAmount,
    usdcAmount: o.usdcAmount,
    utrReferenceHash: keccak256(toHex(db.utrReference ?? "")),
    screenshotHash: keccak256(toHex(db.screenshotPath ?? "")),
    submittedAt: 0n,
    // off-chain LP EIP-712 attestation is not captured in the current
    // manual-review proof flow; anchor to the off-chain proof record hash
    // so the on-chain proof is reconstructable. verifierSignatureHash is
    // genuinely absent (no automated verifier integration yet).
    lpSignatureHash: keccak256(toHex(db.proofHash)),
    verifierSignatureHash: ZERO_BYTES32,
  };
  const hash = await wallet.writeContract({
    address: addr as Hex,
    abi: CASHOUT_ABI,
    functionName: "recordProof",
    args: [cashoutId as Hex, proof],
    chain: null,
    account: wallet.account!,
  });
  await arcPublic().waitForTransactionReceipt({ hash });
  log.info("cashout.proof.onchain", { cashoutId, hash });
}

/** Resolve an LP's display name from its on-chain bytes32 id (used when an
 * idempotent claim retry mirrors an LP that differs from the fresh pick). */
async function lpNameFor(lpId: string): Promise<string> {
  const { data } = await sb()
    .from("lp_profiles")
    .select("legal_entity_name")
    .eq("lp_id", lpId)
    .maybeSingle();
  return data?.legal_entity_name ?? "LP";
}

export interface CashoutJob {
  orderId: string;
  kind: "match-lp" | "proof-verify" | "release" | "expire-quote";
}

export function startCashoutAdvancer() {
  startWorker<CashoutJob>(
    "cashout-advance",
    async (job) => {
      const { orderId, kind } = job.data;
      log.info("cashout.step", { orderId, kind });

      switch (kind) {
        case "match-lp": {
          // Pick best-rate LP from active staked pool; record assignment.
          // soft-delete filter was missing; a STAKED but
          // deleted_at-stamped LP was still assignable. Vendor cashouts
          // would route to a wound-down LP whose wallet snapshot
          // ( LPW1) is unreachable for confirmReceived. Same
          // pattern as iters 73/75 deleted_at sweeps.
          // previously discarded `{error}`. Transient
          // PostgREST 5xx → lps undefined → "no active LPs available"
          // with wrong cause. added `{error}` to this branch's
          // WRITE but skipped the READ.
          const { data: lps, error: lpsErr } = await sb()
            .from("lp_profiles")
            .select("lp_id,legal_entity_name,wallet,tier")
            .eq("status", "STAKED")
            .is("deleted_at", null)
            .order("tier", { ascending: false })
            .limit(1);
          if (lpsErr) throw lpsErr;
          const chosen = lps?.[0];
          if (!chosen) {
            log.warn("cashout.no_lp", { orderId });
            throw new Error("no active LPs available");
          }
          // Advance the escrow on-chain (LOCKED → CLAIMED) BEFORE mirroring
          // the DB, so the DB never records an LP assignment the chain
          // doesn't hold (proof beats claims). Returns the LP id now
          // authoritative on-chain — on an idempotent retry that finds the
          // order already claimed, that on-chain id wins over `chosen`.
          const claimedLpId = await advanceClaimOnChain(orderId, chosen.lp_id);
          const claimedLpName =
            claimedLpId === chosen.lp_id
              ? (chosen.legal_entity_name ?? "LP")
              : await lpNameFor(claimedLpId);
          // same {error} pattern applied to
          // confirm + released branches; this match-lp branch was
          // skipped. A failed write would leave DB out of sync with
          // the just-enqueued notify-vendor "an LP picked this up"
          // message + worker would still return ok, so no BullMQ retry.
          const upMatch = await sb()
            .from("cashout_orders")
            .update({
              status: "CLAIMED",
              lp_id: claimedLpId,
              lp_name: claimedLpName,
            })
            .eq("id", orderId);
          if (upMatch.error) throw upMatch.error;
          // jobId dedup with arcSubscriber OrderClaimed
          // enqueue (see arcSubscriber.ts). Same dedup pattern keeps
          // dev (advancer fires alone) and prod (both fire) at one
          // email per claim.
          await queue("notify-vendor").add(
            orderId,
            { orderId, kind: "cashout.lp_assigned" },
            { jobId: `notify-vendor_lp_assigned_${orderId}` },
          );
          return;
        }
        case "proof-verify": {
          // previously discarded `{error}`. Transient
          // read failure threw "no proof on file" with wrong cause →
          // 5 retries on a phantom missing proof + misleading runbook.
          const { data: order, error: orderErr } = await sb()
            .from("cashout_orders")
            .select("proof_hash,vendor_id")
            .eq("id", orderId)
            .single();
          if (orderErr) throw orderErr;
          if (!order?.proof_hash) throw new Error("no proof on file");
          // same — transient failure → proof undefined
          // → notify-admin fires "review proof" on an already-verified
          // proof. JobId dedup limits to one email, but it's still a
          // false alarm masking a transient infra issue.
          const { data: proof, error: proofErr } = await sb()
            .from("payout_proofs")
            .select("verified_at,simulated,utr_reference,screenshot_path")
            .eq("order_id", orderId)
            .eq("proof_hash", order.proof_hash)
            .maybeSingle();
          if (proofErr) throw proofErr;
          if (!proof?.verified_at || proof.simulated) {
            log.warn("cashout.proof.pending_verified_evidence", { orderId });
            // deterministic jobId dedup with
            // proofVerifier's notify-admin enqueue (same name).
            await queue("notify-admin").add(
              `proof-review:${orderId}`,
              { orderId, kind: "cashout.proof_review_required" },
              { jobId: `notify-admin_proof-review_${orderId}` },
            );
            return;
          }
          // Anchor the verified proof on-chain + advance the escrow
          // (CLAIMED → PROOF_SUBMITTED) BEFORE the DB flips to CONFIRMED, so
          // the release leg's operatorConfirmReceived has the PROOF_SUBMITTED
          // state it requires. Without this the on-chain order stays CLAIMED
          // and release reverts InvalidStatus → DLQ → vendor USDC stranded.
          await advanceProofOnChain(orderId, {
            vendorId: order.vendor_id,
            utrReference: proof.utr_reference ?? null,
            screenshotPath: proof.screenshot_path ?? null,
            proofHash: order.proof_hash,
          });
          // surface Supabase `{ error }` ( daemon pattern).
          const upConfirm = await sb()
            .from("cashout_orders")
            .update({ status: "CONFIRMED" })
            .eq("id", orderId);
          if (upConfirm.error) throw upConfirm.error;
          await queue("notify-vendor").add(orderId, {
            orderId,
            kind: "cashout.confirm_receipt",
          });
          return;
        }
        case "release": {
          // (2026-05-25): actually sign + send the
          // `confirmReceived` tx on Arc instead of only flipping the DB row.
          // The on-chain call moves USDC from escrow → LP; the DB update mirrors
          // for fast reads. Idempotent: if the order is already RELEASED, skip.
          // previous version selected a
          // non-existent `on_chain_id` column → the on-chain branch was always
          // skipped silently. `cashout_orders.id` IS the bytes32 on-chain id
          // per migration 0004:94.
          // previously destructured only `{data: row}`.
          // On a transient PostgREST error, `row` was null →
          // `row?.id` was undefined → the on-chain signing branch was
          // skipped → fell through to the else branch which only threw
          // when no wallet OR no addr, otherwise proceeded to flip DB
          // to RELEASED + notify-lp. Result: LP got "released" email
          // but USDC stayed in escrow. Same money-divergence class as
          // screen.settle. Surface the read error.
          // select vendor_wallet too so we can pass it
          // to operatorConfirmReceived (contract verifies match).
          // pre-audit: column is `vendor_wallet` per
          // migration 0004:96 — incorrectly named it
          // `vendor_address`, which would have failed every release.
          // also select usdc_amount so the notify-lp
          // enqueue can carry amountUsdc — without it, the consumer's
          // render arm falls back to the generic "USDC has been
          // released" copy and LP doesn't see the actual amount
          // (inconsistent with the listener-side enqueue which does
          // pass amountUsdc; jobId dedup picks whichever fires first).
          const { data: row, error: rowErr } = await sb()
            .from("cashout_orders")
            .select("id, status, vendor_wallet, usdc_amount")
            .eq("id", orderId)
            .single();
          if (rowErr) throw rowErr;
          if (row?.status === "RELEASED") {
            log.info("cashout.release.already", { orderId });
            return;
          }
          const wallet = arcWallet();
          const addr = env.CASHOUT_ORDER_PROCESSOR_ADDRESS;
          if (wallet && addr && row?.id && row?.vendor_wallet) {
            // Chain-FIRST idempotency: if a prior attempt already moved the
            // order to RELEASED on-chain but the DB UPDATE below failed (leaving
            // status=CONFIRMED), a BullMQ retry must NOT re-sign
            // operatorConfirmReceived — the contract would revert
            // InvalidStatus(PROOF_SUBMITTED, RELEASED) → DLQ → vendor USDC
            // stranded with DB diverged from chain. Read chain truth; if already
            // RELEASED, skip the tx and fall through to repair the DB mirror.
            const oc = await onChainOrder(addr, orderId);
            if (Number(oc.status) === ON_CHAIN_STATUS.RELEASED) {
              log.info("cashout.release.onchain.already", { orderId });
            } else {
              try {
                // call operatorConfirmReceived instead of
                // the vendor-only confirmReceived. Daemon signs as the
                // operator key; contract validates the passed vendor.
                const hash = await wallet.writeContract({
                  address: addr as `0x${string}`,
                  abi: CASHOUT_ABI,
                  functionName: "operatorConfirmReceived",
                  args: [
                    row.id as `0x${string}`,
                    row.vendor_wallet as `0x${string}`,
                  ],
                  chain: null,
                  account: wallet.account!,
                });
                await arcPublic().waitForTransactionReceipt({ hash });
                log.info("cashout.release.onchain", { orderId, hash });
              } catch (e) {
                log.error("cashout.release.onchain.failed", {
                  orderId,
                  err: (e as Error).message,
                });
                throw e;
              }
            }
          } else {
            // route through
            // `requireArcWalletInProd` so the error message correctly
            // distinguishes "no wallet at all" vs "Circle Wallets
            // configured but signer not yet wired". Falls through to
            // throw with the right runbook hint regardless of branch.
            if (!addr) {
              throw new Error(
                `cashout_release_not_configured: CASHOUT_ORDER_PROCESSOR_ADDRESS missing (orderId=${orderId})`,
              );
            }
            if (!row?.vendor_wallet) {
              // vendor_wallet is required for the
              // operator path. The row must have it from request time
              // (set on cashout_orders.requestAndLock).
              throw new Error(
                `cashout_release_no_vendor_wallet: orderId=${orderId} — row missing vendor_wallet; cannot call operatorConfirmReceived`,
              );
            }
            const { requireArcWalletInProd } = await import("../arc.js");
            requireArcWalletInProd(`cashoutAdvancer.release(${orderId})`);
          }
          const upReleased = await sb()
            .from("cashout_orders")
            .update({
              status: "RELEASED",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          if (upReleased.error) throw upReleased.error;
          // same jobId-dedup pattern as
          // D79-2/3 — both this advancer release branch and the
          // arcSubscriber OrderReleased handler enqueue notify-lp
          // for the same cashoutId. Without a deterministic jobId
          // the LP receives 2 "released" emails per release in prod.
          // pass amountUsdc (6-dec string from
          // usdc_amount numeric column) so the notify-lp render arm
          // formats "$X.XX released" consistently regardless of
          // which producer (this branch or listener) fires first.
          await queue("notify-lp").add(
            orderId,
            {
              orderId,
              kind: "cashout.released",
              amountUsdc: row?.usdc_amount?.toString(),
            },
            { jobId: `notify-lp_released_${orderId}` },
          );
          return;
        }
        case "expire-quote": {
          // same {error} sweep — operator/cron-driven
          // expire was the last cashoutAdvancer branch missing the
          // check.
          const upExp = await sb()
            .from("cashout_orders")
            .update({
              status: "EXPIRED",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", orderId)
            .eq("status", "REQUESTED");
          if (upExp.error) throw upExp.error;
          return;
        }
      }
    },
    4,
  );
}
