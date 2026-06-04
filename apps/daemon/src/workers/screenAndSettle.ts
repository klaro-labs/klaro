/**
 * Screening + settlement worker.
 * Triggered by ArcEventListener on InvoicePaid event.
 * 1. Run 3-of-3 screening (sanctions, behavioral, KYB liveness)
 * — sandbox providers in M1; real APIs in M5.
 * 2. Persist screening_results row.
 * 3. Compute screeningHash = keccak of bundle.
 * 4. Only a configured live screening provider may yield passing results.
 * 5. Simulated results hold the invoice for manual review and never settle it.
 */
import { keccak256, stringToBytes, parseAbi } from "viem";
import { startWorker, queue } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { arcWallet, arcPublic } from "../arc.js";
import { env } from "../env.js";
import { recordReputation, REP_KIND } from "../reputation.js";
import { checkAddressSanctioned } from "../ofac.js";

const ESCROW_ABI = parseAbi([
  "function recordScreening(bytes32 invoiceId, bytes32 screeningHash) external",
  "function settle(bytes32 invoiceId) external",
]);

export interface ScreenAndSettleJob {
  invoiceId: string;
  buyerAddress: string;
  amount: string;
  paidTxHash: string;
}

interface ScreenResult {
  provider: string;
  result: "pass" | "fail" | "review";
  evidenceHash: string;
  detail: string;
}

async function runScreen(
  buyer: string,
  _invoiceId: string,
): Promise<ScreenResult[]> {
  // Sanctions leg — REAL: screen the buyer address against the live OFAC SDN
  // crypto-address list (free, authoritative). A match FAILS the invoice
  // (blocked); a clear PASSES the sanctions leg; an unreachable list holds for
  // manual review (fail-closed — never auto-clear an unscreened buyer).
  let sanctions: ScreenResult;
  const check = await checkAddressSanctioned(buyer);
  if (!check.available) {
    sanctions = {
      provider: "ofac.sanctions",
      result: "review",
      evidenceHash: keccak256(stringToBytes(`s:${buyer}:unavailable`)),
      detail: "OFAC SDN list unavailable — manual review required",
    };
  } else if (check.sanctioned) {
    sanctions = {
      provider: "ofac.sanctions",
      result: "fail",
      evidenceHash: keccak256(stringToBytes(`s:${buyer}:ofac-match`)),
      detail: `OFAC SDN sanctions match — payment blocked (screened vs ${check.listSize} addresses)`,
    };
  } else {
    sanctions = {
      provider: "ofac.sanctions",
      result: "pass",
      evidenceHash: keccak256(stringToBytes(`s:${buyer}:clear:${check.refreshedAt}`)),
      detail: `Cleared against OFAC SDN (${check.listSize} sanctioned addresses)`,
    };
  }

  // Behavioral + KYB legs stay honest manual-review until their providers are
  // wired (KYB needs Sumsub). A clean buyer therefore still holds for review;
  // the real win here is that a sanctioned buyer is now hard-blocked.
  return [
    sanctions,
    {
      provider: "klaro.behavioral",
      result: "review",
      evidenceHash: keccak256(stringToBytes(`b:${buyer}`)),
      detail:
        "[SIMULATED] Behavioral check unavailable - manual review required",
    },
    {
      provider: "sumsub.kyb_liveness",
      result: "review",
      evidenceHash: keccak256(stringToBytes(`k:${buyer}`)),
      detail: "[SIMULATED] KYB decision unavailable - manual review required",
    },
  ];
}

export function startScreenAndSettle() {
  startWorker<ScreenAndSettleJob>(
    "screen-and-settle",
    async (job) => {
      const { invoiceId, buyerAddress, paidTxHash } = job.data;
      log.info("screen.start", {
        invoiceId,
        buyer: buyerAddress.slice(0, 10) + "…",
      });

      const results = await runScreen(buyerAddress, invoiceId);
      // switched insert → upsert with
      // composite-unique (invoice_id, provider) so BullMQ retries +
      // listener re-fires don't duplicate-insert the same 3-of-3 bundle.
      // Migration 0016 added the constraint.
      // PostgREST writes return
      // `{ error }` in the result object instead of throwing. Without
      // checking, a failed upsert after a successful on-chain settle
      // tx leaves DB diverged from chain truth + the worker returns
      // normally so BullMQ never retries. Every write in this worker
      // now throws on error.
      const upsertScreening = await sb()
        .from("screening_results")
        .upsert(
          results.map((r) => ({
            invoice_id: invoiceId,
            buyer_address: buyerAddress,
            provider: r.provider,
            result: r.result,
            evidence_hash: r.evidenceHash,
            detail_md: r.detail,
          })),
          { onConflict: "invoice_id,provider" },
        );
      if (upsertScreening.error) throw upsertScreening.error;

      if (results.some((r) => r.result === "fail")) {
        log.warn("screen.fail", { invoiceId });
        // the previous version
        // updated status to PAID (no-op since invoice was already PAID)
        // and called it done. Vendor saw the invoice render as
        // paid-but-not-yet-settled forever with no honest "blocked"
        // surface. Flip `requires_admin_review` so the vendor UI can
        // render a banner + the admin tooling page lists the row.
        // On-chain `status` stays PAID (mirror of escrow truth);
        // off-chain `requires_admin_review` is the operational state.
        const upReview = await sb()
          .from("invoices")
          .update({ requires_admin_review: true })
          .eq("id", invoiceId);
        if (upReview.error) throw upReview.error;
        // NotifyJob.kind drives the dispatcher subject
        // line ("Admin queue: ${d.kind}"). Without `kind` the admin
        // emails rendered "Admin queue: undefined".
        // deterministic jobId so adminRisk's 15-min
        // re-enqueue (which uses jobId `screen-and-settle:${invoiceId}`)
        // doesn't trigger a fresh notify-admin email every cycle.
        await queue("notify-admin").add(
          "screening-fail",
          { invoiceId, paidTxHash, kind: "screening.fail" },
          { jobId: `notify-admin_screening-fail_${invoiceId}` },
        );
        return;
      }
      if (results.some((r) => r.result === "review")) {
        log.info("screen.review", { invoiceId });
        await queue("notify-admin").add(
          "screening-review",
          { invoiceId, paidTxHash, kind: "screening.review" },
          { jobId: `notify-admin_screening-review_${invoiceId}` },
        );
        return;
      }

      // This branch is reachable only after live providers are wired and return
      // pass results. Simulated checks above always stop in manual review.
      log.info("screen.pass", { invoiceId });

      const bundle = results.map((r) => r.evidenceHash).join(":");
      const screeningHash = keccak256(stringToBytes(bundle));

      const wallet = arcWallet();
      const addr = env.INVOICE_ESCROW_ADDRESS;

      // the previous version
      // recorded the screening hash on chain but NEVER called
      // `escrow.settle(invoiceId)` — yet still flipped the DB row to
      // `status: "SETTLED"`. The vendor saw "settled" while USDC
      // remained locked in escrow. Forward-looking when live providers
      // start returning `pass`: this would silently lie about every
      // payment. Two on-chain txs now happen IN ORDER, each waited on,
      // before the DB is told the invoice is settled. The settle tx
      // hash (not the buyer's paid tx hash) is what we persist as
      // `settled_tx_hash` so off-chain reconcilers can match the move.
      let settleTxHash: `0x${string}` | null = null;
      if (wallet && addr) {
        try {
          const recordHash = await wallet.writeContract({
            address: addr as `0x${string}`,
            abi: ESCROW_ABI,
            functionName: "recordScreening",
            args: [invoiceId as `0x${string}`, screeningHash],
            chain: null,
            account: wallet.account!,
          });
          await arcPublic().waitForTransactionReceipt({ hash: recordHash });
          log.info("screen.recordScreening.onchain", {
            invoiceId,
            hash: recordHash,
            screeningHash,
          });

          settleTxHash = await wallet.writeContract({
            address: addr as `0x${string}`,
            abi: ESCROW_ABI,
            functionName: "settle",
            args: [invoiceId as `0x${string}`],
            chain: null,
            account: wallet.account!,
          });
          await arcPublic().waitForTransactionReceipt({ hash: settleTxHash });
          log.info("screen.settle.onchain", {
            invoiceId,
            hash: settleTxHash,
          });
        } catch (e) {
          log.error("screen.onchain.failed", {
            invoiceId,
            err: (e as Error).message,
          });
          throw e;
        }
      } else {
        // previously this branch
        // logged a warn + proceeded to flip DB to SETTLED — meaning in
        // production, a missing env var would silently mark money released
        // while no chain tx existed. Now fail-loud in prod so BullMQ
        // retries + DLQ surfaces to PagerDuty (Klaro ).
        // route through
        // `requireArcWalletInProd` so the error correctly distinguishes
        // "no wallet" vs "Circle Wallets signer not yet wired" (a known
        // gap, not a misconfig).
        if (env.NODE_ENV === "production") {
          if (!addr) {
            throw new Error(
              `screen_settle_not_configured: INVOICE_ESCROW_ADDRESS missing (invoiceId=${invoiceId})`,
            );
          }
          const { requireArcWalletInProd } = await import("../arc.js");
          requireArcWalletInProd(`screenAndSettle.settle(${invoiceId})`);
        }
        log.warn("screen.onchain.skipped", {
          invoiceId,
          screeningHash,
          reason: "no_wallet_or_addr",
        });
      }

      // Only flip the DB row to SETTLED AFTER both on-chain calls have
      // been waited on (settleTxHash != null). When the on-chain branch
      // was skipped — dev/test only, per the fail-loud guard above —
      // fall back to the buyer's paidTxHash so the row remains coherent.
      // QA-054: invoices table has no screening_hash column — that field
      // lives on `receipts` (written by receiptGenerate worker per QA-024
      // fix). Removing it here; the screeningHash is already passed through
      // the receipt-generate job payload below + receiptGenerate composes
      // the on-chain anchor from screening_results rows + the receipts row
      // captures it. Including it in this update produced 'column does not
      // exist' on every auto-pass — silent-fail on the auto-release path.
      const upSettled = await sb()
        .from("invoices")
        .update({
          status: "SETTLED",
          settled_tx_hash: settleTxHash ?? paidTxHash,
        })
        .eq("id", invoiceId);
      if (upSettled.error) throw upSettled.error;
      // #3: on-chain reputation — a settled invoice is a positive signal.
      // Best-effort (never blocks settlement); only on the real on-chain settle.
      if (settleTxHash) {
        const { data: invRow } = await sb()
          .from("invoices")
          .select("vendor_id")
          .eq("id", invoiceId)
          .maybeSingle();
        if (invRow?.vendor_id) {
          await recordReputation(
            invRow.vendor_id as string,
            REP_KIND.INVOICE_SETTLED,
            12,
            settleTxHash,
          );
        }
      }
      // previous code passed `paidTxHash` here, but the
      // listener-side enqueue (arcSubscriber InvoiceSettled handler)
      // passes `ev.transactionHash` (the actual settle tx). The receipt
      // hash = keccak("r:invoiceId:settlementTx:metadataHash") so the
      // two enqueues produced TWO distinct receipt rows; `receipt_hash`
      // ended up whichever ran last. Use settleTxHash so this worker's
      // enqueue matches what the listener will write.
      // jobId dedup with listener-side enqueue.
      await queue("receipt-generate").add(
        invoiceId,
        {
          invoiceId,
          settlementTx: settleTxHash ?? paidTxHash,
          screeningHash,
        },
        { jobId: `receipt-generate_${invoiceId}` },
      );
      await queue("erp-sync").add(invoiceId, {
        invoiceId,
        kind: "invoice.pay",
      });
      await queue("notify-vendor").add(
        invoiceId,
        { invoiceId, kind: "invoice.settled" },
        { jobId: `notify-vendor_settled_${invoiceId}` },
      );
    },
    4,
  );
}
