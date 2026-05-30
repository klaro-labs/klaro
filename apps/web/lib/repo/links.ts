/**
 * Payment-link repository — dual-mode (Supabase live · mockData fallback),
 * mirroring lib/repo/invoices.ts. A Klaro Link is NOT an invoice: the backing
 * invoice row is created at pay time (see app/pay/[slug]/actions.ts). Live mode
 * is engaged when SUPABASE_URL is set; otherwise mock.
 */
import { keccak256, stringToBytes } from "viem";
import { tryDb, serviceDb } from "../db";
import { linkPublisherLive } from "../env";
import { publishLinkInvoiceOnChain } from "../linkPublish";
import type { DbPaymentLink } from "../dbTypes";
import {
  mockCreateLink,
  mockGetLinkBySlug,
  mockGetLinkById,
  mockListLinksForVendor,
  mockDeactivateLink,
  mockIncrementLinkPaid,
  mockCreateInvoice,
  mockGetInvoice,
} from "../mockData";
import type { Hex, PaymentLink } from "../types";

const USDC_ARC: Hex = "0x3600000000000000000000000000000000000000";

type DbLinkWithVendor = DbPaymentLink & {
  vendors?: { wallet: string | null; display_name: string | null } | null;
};

const LINK_SELECT = "*, vendors!inner(wallet, display_name)";

// amount_usdc stores 6-dec USDC units as numeric (same convention as
// invoices.amount_usdc) — coerce to string and strip any scale before BigInt.
function amountToBigInt(v: string | number): bigint {
  return BigInt(String(v).replace(/\.\d+$/, "")) ?? 0n;
}

function fromRow(row: DbLinkWithVendor): PaymentLink {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorWallet: row.vendors?.wallet ? (row.vendors.wallet as Hex) : null,
    vendorDisplayName: row.vendors?.display_name ?? null,
    slug: row.slug,
    amount: amountToBigInt(row.amount_usdc),
    label: row.label,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at) : null,
    viewCount: row.view_count,
    paidCount: row.paid_count,
    createdAt: new Date(row.created_at),
  };
}

// get_public_link RPC returns a flat row (vendor_wallet / vendor_display_name).
function fromRpcRow(r: {
  id: string; vendor_id: string; vendor_wallet: string | null;
  vendor_display_name: string | null; slug: string; amount_usdc: string | number;
  label: string | null; expires_at: string | null; deactivated_at: string | null;
  view_count: number; paid_count: number; created_at: string;
}): PaymentLink {
  return {
    id: r.id,
    vendorId: r.vendor_id,
    vendorWallet: r.vendor_wallet ? (r.vendor_wallet as Hex) : null,
    vendorDisplayName: r.vendor_display_name ?? null,
    slug: r.slug,
    amount: amountToBigInt(r.amount_usdc),
    label: r.label,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at) : null,
    viewCount: r.view_count,
    paidCount: r.paid_count,
    createdAt: new Date(r.created_at),
  };
}

export async function createLink(args: {
  vendorId: string;
  slug: string;
  amountUsdc: bigint;
  label?: string | null;
  expiresAt?: Date | null;
  // Klaro Link on-chain authorization, captured at creation when the vendor
  // signs in their wallet. Omitted in simulator mode (the link still works as
  // a demo). The contract enforces these terms at publish time.
  linkChainId?: Hex | null;
  vendorAuthSig?: Hex | null;
  authDeadline?: bigint | null;
}): Promise<PaymentLink> {
  const c = await tryDb();
  if (!c) {
    return mockCreateLink({
      vendorId: args.vendorId,
      slug: args.slug,
      amount: args.amountUsdc,
      label: args.label ?? null,
      expiresAt: args.expiresAt ?? null,
    });
  }
  const insert = await c
    .from("payment_links")
    .insert({
      vendor_id: args.vendorId,
      slug: args.slug,
      amount_usdc: args.amountUsdc.toString(),
      label: args.label ?? null,
      expires_at: args.expiresAt ? args.expiresAt.toISOString() : null,
      link_chain_id: args.linkChainId ?? null,
      vendor_auth_sig: args.vendorAuthSig ?? null,
      auth_deadline: args.authDeadline != null ? Number(args.authDeadline) : null,
    })
    .select(LINK_SELECT)
    .single();
  if (insert.error) throw insert.error;
  return fromRow(insert.data as DbLinkWithVendor);
}

/** On-chain authorization a vendor signed at link creation. Server-only — read
 *  via the service-role client (the signature isn't exposed publicly). Returns
 *  null when the link predates 0029 or was created in simulator mode. */
export interface LinkOnChainAuth {
  linkChainId: Hex;
  vendorAuthSig: Hex;
  authDeadline: bigint;
}
export async function getLinkAuth(linkId: string): Promise<LinkOnChainAuth | null> {
  const c = await tryDb();
  if (!c) return null; // mock mode has no real chain
  const sb = serviceDb();
  const { data, error } = await sb
    .from("payment_links")
    .select("link_chain_id, vendor_auth_sig, auth_deadline")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.link_chain_id || !data?.vendor_auth_sig || data?.auth_deadline == null) {
    return null;
  }
  return {
    linkChainId: data.link_chain_id as Hex,
    vendorAuthSig: data.vendor_auth_sig as Hex,
    authDeadline: BigInt(data.auth_deadline),
  };
}

/** Public, anon-safe lookup via the get_public_link SECURITY DEFINER RPC. */
export async function getLinkBySlug(slug: string): Promise<PaymentLink | null> {
  const c = await tryDb();
  if (!c) return mockGetLinkBySlug(slug);
  const { data, error } = await c.rpc("get_public_link", { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? fromRpcRow(row) : null;
}

/** Vendor-scoped fetch (RLS enforces ownership). */
export async function getLinkById(id: string): Promise<PaymentLink | null> {
  const c = await tryDb();
  if (!c) return mockGetLinkById(id);
  const { data, error } = await c
    .from("payment_links")
    .select(LINK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbLinkWithVendor) : null;
}

export async function listLinksForVendor(vendorId: string): Promise<PaymentLink[]> {
  const c = await tryDb();
  if (!c) return mockListLinksForVendor(vendorId);
  const { data, error } = await c
    .from("payment_links")
    .select(LINK_SELECT)
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbLinkWithVendor[]).map(fromRow);
}

export async function deactivateLink(id: string): Promise<void> {
  const c = await tryDb();
  if (!c) return mockDeactivateLink(id);
  const { error } = await c
    .from("payment_links")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function incrementLinkView(slug: string): Promise<void> {
  const c = await tryDb();
  if (!c) return; // mock: view counting is a no-op
  await c.rpc("increment_link_view", { p_slug: slug });
}

/** Service-role only — called from the daemon after a link-backed invoice
 *  settles. Bumps paid_count. */
export async function incrementLinkPaid(id: string): Promise<void> {
  const c = await tryDb();
  if (!c) return mockIncrementLinkPaid(id);
  const sb = serviceDb();
  // numeric increment via RPC-less update: read-then-write is racy; use SQL via
  // a small RPC would be ideal, but a single-row +1 is acceptable here since
  // settle is serialized per invoice. Best-effort.
  const { data } = await sb.from("payment_links").select("paid_count").eq("id", id).maybeSingle();
  const next = ((data?.paid_count as number) ?? 0) + 1;
  await sb.from("payment_links").update({ paid_count: next }).eq("id", id);
}

/** Everything the buyer's pay flow (PayWithUSDC) needs, serialized across the
 *  server→client boundary (bigint → string, Date → unix seconds). dueAtUnix +
 *  metadataHash MUST equal what was published on-chain, or acceptAndPay's
 *  signature check fails. `onChain` tells the UI which mode is live. */
export interface LinkInvoiceParams {
  invoiceId: Hex;
  vendor: Hex;
  token: Hex;
  amount: string;
  dueAtUnix: number;
  metadataHash: Hex;
  onChain: "published" | "already-onchain" | "simulator";
}

/**
 * The deferred-invoice junction: when a buyer taps Pay on /pay/[slug], create
 * (or reuse) the backing invoice row AND publish it on-chain via createInvoiceFor
 * (relayed, using the vendor's stored LinkInvoiceAuthorization), then hand the
 * exact params to the normal escrow pay flow. Buyer is anonymous (no vendor
 * session) so the row is written with the service-role client. Idempotent under
 * double-tap via a deterministic id keyed to a 5-minute bucket (a genuine
 * re-payment after the window gets a fresh invoice; a double-tap reuses the same
 * one — and the on-chain publish is itself idempotent).
 */
export async function getOrCreateLinkInvoice(
  link: PaymentLink,
  buyerWallet: Hex,
): Promise<LinkInvoiceParams> {
  if (link.deactivatedAt) throw new Error("link_deactivated");
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new Error("link_expired");
  if (!link.vendorWallet) throw new Error("vendor_wallet_unprovisioned");

  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const id = keccak256(
    stringToBytes(`klaro.link|${link.id}|${buyerWallet.toLowerCase()}|${bucket}`),
  ) as Hex;
  const dueAt = link.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const dueAtUnix = Math.floor(dueAt.getTime() / 1000);
  const metadataHash = keccak256(
    stringToBytes(JSON.stringify({ link: link.slug, label: link.label, amount: link.amount.toString() })),
  ) as Hex;
  const customer = { email: `link+${link.slug}@klaro.pay`, name: "Paid via link" };
  const lineItems = link.label ? [{ description: link.label, amount: link.amount }] : [];

  const base = {
    invoiceId: id,
    vendor: link.vendorWallet,
    token: USDC_ARC,
    amount: link.amount.toString(),
    dueAtUnix,
    metadataHash,
  };

  const c = await tryDb();
  if (!c) {
    if (!mockGetInvoice(id)) {
      mockCreateInvoice({
        id, vendorId: link.vendorId, vendorWallet: link.vendorWallet, token: USDC_ARC,
        amount: link.amount, dueAt, customer, lineItems, metadataHash,
      });
    }
    return { ...base, onChain: "simulator" };
  }

  const sb = serviceDb();
  const existing = await sb.from("invoices").select("id").eq("id", id).maybeSingle();
  if (!existing.data) {
    const ins = await sb.from("invoices").insert({
      id,
      vendor_id: link.vendorId,
      customer_email: customer.email,
      customer_name: customer.name,
      amount_usdc: link.amount.toString(),
      token: USDC_ARC,
      due_at: dueAt.toISOString(),
      privacy_mode: "public",
      metadata_hash: metadataHash,
      link_id: link.id,
    });
    if (ins.error && !/duplicate|unique|already exists|conflict/i.test(ins.error.message ?? "")) {
      throw ins.error;
    }
    if (lineItems.length > 0) {
      await sb
        .from("invoice_line_items")
        .insert(lineItems.map((l, i) => ({ invoice_id: id, description: l.description, amount_usdc: l.amount.toString(), position: i })))
        .then(() => {}, () => {});
    }
  }

  // Publish on-chain so acceptAndPay has an invoice to settle against. In
  // simulator mode (no relayer/escrow) this is a no-op and PayWithUSDC runs the
  // in-memory simulator. If we're live but the vendor never signed an auth, the
  // link is unpayable on-chain — surface that honestly rather than mint a row
  // that would revert at acceptAndPay.
  if (!linkPublisherLive()) {
    return { ...base, onChain: "simulator" };
  }
  const auth = await getLinkAuth(link.id);
  if (!auth) throw new Error("link_missing_onchain_authorization");
  const published = await publishLinkInvoiceOnChain({
    invoiceId: id,
    vendor: link.vendorWallet,
    token: USDC_ARC,
    amount: link.amount,
    dueAtUnix: BigInt(dueAtUnix),
    metadataHash,
    linkChainId: auth.linkChainId,
    authDeadline: auth.authDeadline,
    vendorAuthSig: auth.vendorAuthSig,
  });
  const onChain = published.status === "published" ? "published" : "already-onchain";
  return { ...base, onChain };
}
