/**
 * Cashout advancer worker — moves cashout orders through their state machine.
 * Triggered by ArcEventListener on OrderClaimed/ProofSubmitted events + by
 * scheduler for quote-expiry checks.
 */
import { parseAbi } from "viem";
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcWallet, arcPublic } from "../arc.js";
import { env } from "../env.js";

// previously called `confirmReceived(bytes32)` which is
// vendor-only. The daemon's operator wallet is NOT the vendor → contract
// reverts NotVendor → 5 BullMQ retries → DLQ → USDC stuck. added
// `operatorConfirmReceived(bytes32, address expectedVendor)` to the
// contract: onlyOperator + validates the expected vendor matches the
// recorded order vendor (defense-in-depth on operator-key compromise).
const CASHOUT_ABI = parseAbi([
  "function confirmReceived(bytes32 cashoutId) external",
  "function operatorConfirmReceived(bytes32 cashoutId, address expectedVendor) external",
]);

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
          // same {error} pattern applied to
          // confirm + released branches; this match-lp branch was
          // skipped. A failed write would leave DB out of sync with
          // the just-enqueued notify-vendor "an LP picked this up"
          // message + worker would still return ok, so no BullMQ retry.
          const upMatch = await sb()
            .from("cashout_orders")
            .update({
              status: "CLAIMED",
              lp_id: chosen.lp_id,
              lp_name: chosen.legal_entity_name ?? "LP",
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
            .select("proof_hash")
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
            .select("verified_at,simulated")
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
