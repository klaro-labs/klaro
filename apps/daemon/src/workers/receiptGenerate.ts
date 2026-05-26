/**
 * Receipt generator — once an invoice settles on chain, mint the public
 * Stenn-Proof receipt row in Supabase + (eventually) anchor to AuditReceipt.
 * M1: stores receipt row + computes receipt_hash from invoice + settlement tx.
 * M5: calls AuditReceipt.mintReceipt() on chain.
 */
import { keccak256, stringToBytes } from "viem";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export interface ReceiptJob {
  invoiceId: string;
  settlementTx: string;
}

export function startReceiptGenerate() {
  startWorker<ReceiptJob>(
    "receipt-generate",
    async (job) => {
      const { invoiceId, settlementTx } = job.data;
      // previously discarded `{error}`. A transient
      // PostgREST failure rendered inv as null → threw "invoice not
      // found" with wrong cause. Surface the read error.
      const { data: inv, error: invErr } = await sb()
        .from("invoices")
        .select("metadata_hash,acceptance_sig")
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;
      if (!inv)
        throw new Error(`receipt-generate: invoice ${invoiceId} not found`);

      const receiptHash = keccak256(
        stringToBytes(`r:${invoiceId}:${settlementTx}:${inv.metadata_hash}`),
      );
      // Audit fix (loop ): idempotent upsert.
      // Audit fix (loop ): check `{ error }` so a failed write
      // throws + BullMQ retries instead of silently no-op'ing.
      const upRcpt = await sb()
        .from("receipts")
        .upsert(
          {
            invoice_id: invoiceId,
            receipt_hash: receiptHash,
            invoice_hash: inv.metadata_hash,
            acceptance_hash: inv.acceptance_sig ?? null,
            settlement_tx: settlementTx,
            settled_at: new Date().toISOString(),
            source_chain_id: 5_042_002,
          },
          { onConflict: "receipt_hash", ignoreDuplicates: true },
        );
      if (upRcpt.error) throw upRcpt.error;

      const upInv = await sb()
        .from("invoices")
        .update({ receipt_hash: receiptHash })
        .eq("id", invoiceId);
      if (upInv.error) throw upInv.error;
      log.info("receipt.minted", { invoiceId, receiptHash });
    },
    4,
  );
}
