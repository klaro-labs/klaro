/**
 * Receipts repository — dual-mode.
 * Receipts are PUBLIC read by hash (intentionally — they're the share-anywhere artifact).
 * Inserts happen from the daemon's ReceiptGenerator worker via serviceDb().
 */
import { tryDb } from "../db";
import type { DbReceipt } from "../dbTypes";
import type { Hex, ReceiptAnchor } from "../types";

// QA-023 fix: hydrate vendor wallet from the joined invoices→vendors path
// instead of stubbing 0x0. The receipt page rendered "Vendor wallet: 0x0000…0000"
// for every receipt because fromRow had a placeholder.
type DbReceiptWithVendor = DbReceipt & {
  invoices?: { vendors?: { wallet: string | null } | null } | null;
};

function fromRow(row: DbReceiptWithVendor): ReceiptAnchor {
  const vendorWallet = row.invoices?.vendors?.wallet;
  return {
    invoiceId: row.invoice_id as Hex,
    invoiceHash: row.invoice_hash as Hex,
    acceptanceHash: (row.acceptance_hash ?? row.invoice_hash) as Hex,
    screeningHash: (row.screening_hash ?? row.invoice_hash) as Hex,
    settlementTx: row.settlement_tx as Hex,
    settledAt: new Date(row.settled_at),
    sourceChainId: row.source_chain_id ?? 5_042_002,
    vendor: (vendorWallet ?? "0x" + "0".repeat(40)) as Hex,
  };
}

// Nested PostgREST select pulls the vendor wallet alongside the receipt row
// in one round trip. Non-inner join: a receipt is PUBLIC (anon hits
// /api/v1/receipts/[hash] + the receipt-badge/SDK use it), but `invoices` is
// RLS-protected — an inner join made every anon receipt fetch return null → the
// public API 404'd for valid receipts. With a left join the receipt always
// returns; the vendor wallet hydrates only when the caller can read
// invoices→vendors (authenticated vendor) and is null for anon (the wallet is
// on-chain-public anyway). fromRow already tolerates null invoices/vendors.
const RECEIPT_SELECT = "*, invoices(vendors(wallet))";

export async function getByHash(hash: Hex): Promise<ReceiptAnchor | null> {
  const c = await tryDb();
  if (!c) return null;
  const { data, error } = await c
    .from("receipts")
    .select(RECEIPT_SELECT)
    .eq("receipt_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbReceiptWithVendor) : null;
}

export async function getByInvoice(
  invoiceId: Hex,
): Promise<ReceiptAnchor | null> {
  const c = await tryDb();
  if (!c) return null;
  const { data, error } = await c
    .from("receipts")
    .select(RECEIPT_SELECT)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbReceiptWithVendor) : null;
}
