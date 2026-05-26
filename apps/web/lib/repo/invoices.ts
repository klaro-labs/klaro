/**
 * Invoice repository — dual-mode (Supabase live · mockData fallback).
 * Every server action that touches invoices imports from here, never from db.ts directly.
 * That way the live → mock fallback decision lives in one file with one rule.
 * Live mode is engaged when `SUPABASE_URL` is set. Otherwise, we delegate to
 * `mockData.ts` (in-memory Map) so dev + first-run still works without a Supabase project.
 */
import { tryDb } from "../db";
import type { DbInvoice } from "../dbTypes";
import {
  mockCreateInvoice,
  mockGetInvoice,
  mockListInvoices,
  mockListAllInvoices,
  mockAdvanceInvoiceStatus,
} from "../mockData";
import type { Hex, Invoice } from "../types";

/**
 * previously hardcoded `vendorWallet: "0x" + "0".repeat(40)`
 * because the invoices table has no vendor_wallet column (only vendor_id
 * FK). Three consumers used the value as if it were real — buyer-facing
 * /i/[id] showed "0x0000...0000" as the payment recipient + PayWithUSDC
 * signed the zero address into the EIP-712 payload. Now: callers fetch
 * the vendor's wallet via a join and pass it to fromRow; missing-vendor
 * rows surface as `null` so the UI/PayWithUSDC can render a clear
 * "vendor wallet unprovisioned" state instead of signing 0x0.
 */
type DbInvoiceWithVendor = DbInvoice & {
  vendors?: { wallet: string | null } | null;
};

function fromRow(row: DbInvoiceWithVendor): Invoice {
  const wallet = row.vendors?.wallet;
  return {
    id: row.id as Hex,
    vendorId: row.vendor_id,
    vendorWallet: wallet ? (wallet as Hex) : null,
    token: row.token as Hex,
    amount: BigInt(row.amount_usdc.replace(/\.\d+$/, "")) ?? 0n,
    dueAt: new Date(row.due_at),
    status: row.status,
    customer: {
      email: row.customer_email ?? "unknown@",
      name: row.customer_name ?? undefined,
    },
    lineItems: [], // hydrated via separate query when needed
    metadataHash: row.metadata_hash as Hex,
    splitsHash: (row.splits_hash ?? undefined) as Hex | undefined,
    acceptanceSig: (row.acceptance_sig ?? undefined) as Hex | undefined,
    acceptedBy: (row.accepted_by ?? undefined) as Hex | undefined,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
    paidTx: (row.paid_tx_hash ?? undefined) as Hex | undefined,
    settledTx: (row.settled_tx_hash ?? undefined) as Hex | undefined,
    receiptHash: (row.receipt_hash ?? undefined) as Hex | undefined,
    createdAt: new Date(row.created_at),
  };
}

// PostgREST nested-select syntax — pulls vendor.wallet
// in the same round trip the invoice row is fetched.
const INVOICE_SELECT = "*, vendors!inner(wallet)";

export async function getInvoice(id: Hex): Promise<Invoice | null> {
  const c = await tryDb();
  if (!c) return mockGetInvoice(id);
  const { data, error } = await c
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbInvoiceWithVendor) : null;
}

export async function listInvoicesForVendor(
  vendorId: string,
): Promise<Invoice[]> {
  const c = await tryDb();
  if (!c) return mockListInvoices(vendorId);
  const { data, error } = await c
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbInvoiceWithVendor));
}

/// Dual-mode all-vendors list. Used by the lifecycle-reminder cron so it
/// walks every vendor's invoices in both live + mock paths. Audit fix
/// : previously the cron called the mock
/// directly, so live mode would have silently iterated nothing (or worse
/// — fallen back to the seeded vendor when `tryDb()` returned null).
export async function listAllInvoices(): Promise<Invoice[]> {
  const c = await tryDb();
  if (!c) return mockListAllInvoices();
  const { data, error } = await c
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbInvoiceWithVendor));
}

export async function createInvoice(args: {
  id: Hex;
  vendorId: string;
  vendorWallet: Hex;
  amountUsdc: bigint;
  token: Hex;
  dueAt: Date;
  customer: { email: string; name?: string };
  lineItems: { description: string; amount: bigint }[];
  metadataHash: Hex;
  splitsHash?: Hex;
  privacyMode?: "public" | "hide_amount" | "hide_customer";
  notesMd?: string;
}): Promise<Invoice> {
  const c = await tryDb();
  if (!c) {
    return mockCreateInvoice({
      id: args.id,
      vendorId: args.vendorId,
      vendorWallet: args.vendorWallet,
      token: args.token,
      amount: args.amountUsdc,
      dueAt: args.dueAt,
      customer: args.customer,
      lineItems: args.lineItems,
      metadataHash: args.metadataHash,
    });
  }
  // Live: insert invoice row + line items in a transaction-like batch.
  // (Supabase JS doesn't expose true tx; service-role daemon does atomic writes; here we accept best-effort.)
  const insert = await c
    .from("invoices")
    .insert({
      id: args.id,
      vendor_id: args.vendorId,
      customer_email: args.customer.email,
      customer_name: args.customer.name ?? null,
      amount_usdc: args.amountUsdc.toString(),
      token: args.token,
      due_at: args.dueAt.toISOString(),
      notes_md: args.notesMd ?? null,
      privacy_mode: args.privacyMode ?? "public",
      metadata_hash: args.metadataHash,
      splits_hash: args.splitsHash ?? null,
    })
    .select()
    .single();
  if (insert.error) throw insert.error;

  if (args.lineItems.length > 0) {
    const li = await c.from("invoice_line_items").insert(
      args.lineItems.map((l, i) => ({
        invoice_id: args.id,
        description: l.description,
        amount_usdc: l.amount.toString(),
        position: i,
      })),
    );
    if (li.error) throw li.error;
  }
  // hydrate vendorWallet from the args (caller passed
  // session.vendor.wallet after assertVendorWalletProvisioned). Insert
  // path doesn't have the vendors join row but we know the wallet
  // since the action just enforced it.
  return fromRow({
    ...(insert.data as DbInvoice),
    vendors: { wallet: args.vendorWallet },
  });
}

export async function advanceInvoiceStatus(
  id: Hex,
  patch: Partial<
    Pick<
      DbInvoice,
      | "status"
      | "accepted_by"
      | "accepted_at"
      | "paid_tx_hash"
      | "settled_tx_hash"
      | "receipt_hash"
      | "acceptance_sig"
    >
  >,
): Promise<void> {
  const c = await tryDb();
  if (!c) {
    // mock map handles the subset of fields it knows about
    if (patch.status) await mockAdvanceInvoiceStatus(id, patch.status);
    return;
  }
  const { error } = await c.from("invoices").update(patch).eq("id", id);
  if (error) throw error;
}
