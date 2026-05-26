/**
 * Receipts repository — dual-mode.
 * Receipts are PUBLIC read by hash (intentionally — they're the share-anywhere artifact).
 * Inserts happen from the daemon's ReceiptGenerator worker via serviceDb().
 */
import { tryDb } from "../db";
import type { DbReceipt } from "../dbTypes";
import type { Hex, ReceiptAnchor } from "../types";

function fromRow(row: DbReceipt): ReceiptAnchor {
  return {
    invoiceId: row.invoice_id as Hex,
    invoiceHash: row.invoice_hash as Hex,
    acceptanceHash: (row.acceptance_hash ?? row.invoice_hash) as Hex,
    screeningHash: (row.screening_hash ?? row.invoice_hash) as Hex,
    settlementTx: row.settlement_tx as Hex,
    settledAt: new Date(row.settled_at),
    sourceChainId: row.source_chain_id ?? 5_042_002,
    vendor: ("0x" + "0".repeat(40)) as Hex, // hydrated via separate vendor lookup when needed
  };
}

export async function getByHash(hash: Hex): Promise<ReceiptAnchor | null> {
  const c = await tryDb();
  if (!c) return null;
  const { data, error } = await c
    .from("receipts")
    .select("*")
    .eq("receipt_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbReceipt) : null;
}

export async function getByInvoice(
  invoiceId: Hex,
): Promise<ReceiptAnchor | null> {
  const c = await tryDb();
  if (!c) return null;
  const { data, error } = await c
    .from("receipts")
    .select("*")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbReceipt) : null;
}
