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
import type { Hex, Invoice, InvoiceStatus } from "../types";

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
    // PostgREST returns numeric either as a JS string (preserves precision)
    // or as a number depending on column scale + supabase-js version.
    // Coerce before .replace so both paths work — getPublicInvoice already
    // does this; fromRow was the unfixed twin.
    // amount_usdc is null when the vendor set privacy_mode='hide_amount' (the
    // get_public_invoice RPC redacts it) — guard so the mapping doesn't crash on
    // BigInt(String(null)). Hidden amount surfaces as 0n.
    amount:
      row.amount_usdc == null
        ? 0n
        : BigInt(String(row.amount_usdc).replace(/\.\d+$/, "")),
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
    publishedTx: (row.published_tx_hash ?? undefined) as Hex | undefined,
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

/**
 * Public invoice lookup for /i/[id] — does not require auth.
 * Calls the get_public_invoice SECURITY DEFINER RPC (migration 0022) so
 * the underlying tables stay locked to anon. Single-row by-id only, no
 * enumeration. Returns the same `Invoice` shape as getInvoice() plus
 * eagerly-hydrated line items so the public pay page can render without
 * a second round trip.
 */
export async function getPublicInvoice(
  id: Hex,
): Promise<
  | (Invoice & {
      vendorDisplayName: string | null;
      brandColor: string | null;
      brandLogoUrl: string | null;
    })
  | null
> {
  const c = await tryDb();
  if (!c) {
    const m = await mockGetInvoice(id);
    return m
      ? { ...m, vendorDisplayName: null, brandColor: null, brandLogoUrl: null }
      : null;
  }
  const { data, error } = await c.rpc("get_public_invoice", { p_id: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  // migration 0051 added vendor_brand_color + vendor_brand_logo_url to the RPC;
  // the codegen'd Functions type lags the migration, so narrow just those two.
  const branded = row as {
    vendor_brand_color?: string | null;
    vendor_brand_logo_url?: string | null;
  };
  return {
    id: row.id as Hex,
    vendorId: row.vendor_id,
    vendorWallet: row.vendor_wallet ? (row.vendor_wallet as Hex) : null,
    vendorDisplayName: row.vendor_display_name ?? null,
    brandColor: branded.vendor_brand_color ?? null,
    brandLogoUrl: branded.vendor_brand_logo_url ?? null,
    token: row.token as Hex,
    // amount_usdc is null when the vendor set privacy_mode='hide_amount' (the
    // get_public_invoice RPC redacts it) — guard so the mapping doesn't crash on
    // BigInt(String(null)). Hidden amount surfaces as 0n.
    amount:
      row.amount_usdc == null
        ? 0n
        : BigInt(String(row.amount_usdc).replace(/\.\d+$/, "")),
    dueAt: new Date(row.due_at),
    status: row.status as InvoiceStatus,
    customer: {
      email: row.customer_email ?? "unknown@",
      name: row.customer_name ?? undefined,
    },
    // get_public_invoice returns line_items as jsonb (typed Json by the
    // codegen); the shape is stable so narrow it explicitly for the map.
    lineItems: Array.isArray(row.line_items)
      ? (
          row.line_items as Array<{
            description: string;
            amount_usdc: number | string | null;
          }>
        ).map((li) => ({
          description: li.description,
          amount:
            li.amount_usdc == null
              ? 0n
              : BigInt(String(li.amount_usdc).replace(/\.\d+$/, "")),
        }))
      : [],
    metadataHash: row.metadata_hash as Hex,
    splitsHash: (row.splits_hash ?? undefined) as Hex | undefined,
    acceptanceSig: undefined,
    acceptedBy: undefined,
    acceptedAt: undefined,
    paidTx: undefined,
    settledTx: undefined,
    receiptHash: undefined,
    createdAt: new Date(row.created_at),
  };
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
  // Live: insert the invoice row, then its line items. Supabase JS has no true
  // multi-statement transaction, so these are two round-trips. To avoid leaving
  // an ORPHAN invoice (header persisted, items insert failed), the line-items
  // failure path compensates by deleting the just-inserted invoice and throwing
  // — the caller sees a clean failure to retry rather than a half-written
  // invoice. (A SECURITY-INVOKER `create_invoice_with_items` RPC is the true
  // all-or-nothing fix; deferred to mainnet hardening. The on-chain amount lives
  // on `amount_usdc`, not the item sum, so a transient orphan is never a
  // money-amount bug — only a missing itemization.)
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
    if (li.error) {
      // Compensating delete so we don't strand an orphan invoice. Best-effort:
      // if the cleanup itself fails, surface BOTH errors in the throw so the
      // orphan can't disappear silently (the action layer captures to Sentry).
      const cleanup = await c.from("invoices").delete().eq("id", args.id);
      if (cleanup.error) {
        throw new Error(
          `invoice_line_items insert failed (${li.error.message}); ` +
            `orphan invoice ${args.id} cleanup ALSO failed (${cleanup.error.message}) — needs manual removal`,
        );
      }
      throw li.error;
    }
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

/**
 * QA-020: record the vendor-signed on-chain publish tx for an invoice.
 * The invoice row itself stays `CREATED` — `published_tx_hash` going
 * non-null is what flips the vendor UI from "publish" to "published".
 * Mock mode is a no-op (no chain to publish to).
 */
export async function recordInvoicePublished(
  id: Hex,
  txHash: Hex,
): Promise<void> {
  const c = await tryDb();
  if (!c) return;
  const { error } = await c
    .from("invoices")
    .update({ published_tx_hash: txHash })
    .eq("id", id);
  if (error) throw error;
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
