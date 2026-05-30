/**
 * Cashout repository — dual-mode (Supabase live · mockData fallback).
 */
import { tryDb } from "../db";
import type { DbCashoutOrder } from "../dbTypes";
import {
  mockListCashouts,
  mockGetCashout,
  mockCreateCashout,
  mockAdvanceCashout,
} from "../mockData";
import type {
  Hex,
  CashoutStatus,
  CashoutOrder,
  CashoutTimelineEvent,
} from "../types";

// PostgREST returns numeric as either a JS string (preserves precision)
// or a number depending on column scale + supabase-js version. Coerce to
// string before .replace so both paths work — same fix as
// lib/repo/invoices.ts:fromRow.
const numericToBigInt = (v: string | number): bigint =>
  BigInt(String(v).replace(/\.\d+$/, ""));

function fromRow(row: DbCashoutOrder): CashoutOrder {
  return {
    id: row.id as Hex,
    vendorId: row.vendor_id,
    vendorWallet: row.vendor_wallet as Hex,
    usdcAmount: numericToBigInt(row.usdc_amount),
    // QA-046: payout_minor is numeric in schema (same as usdc_amount).
    // Missed when QA-014 fix introduced numericToBigInt — raw BigInt()
    // would have thrown on the PostgREST-returns-number path.
    payoutMinor: numericToBigInt(row.payout_minor),
    currency: row.currency,
    status: row.status,
    klaroFeeUsdc: numericToBigInt(row.klaro_fee_usdc),
    lpSpreadUsdc: numericToBigInt(row.lp_spread_usdc),
    quoteRate: Number(row.quote_rate),
    quoteHash: row.quote_hash as Hex,
    requestedAt: new Date(row.requested_at),
    quoteExpiresAt: new Date(row.quote_expires_at),
    lpId: row.lp_id ?? undefined,
    lpName: row.lp_name ?? undefined,
    proofHash: (row.proof_hash ?? undefined) as Hex | undefined,
    utrReference: row.utr_reference ?? undefined,
    timeline: [], // hydrated via separate query when needed
  };
}

export async function listForVendor(vendorId: string): Promise<CashoutOrder[]> {
  const c = await tryDb();
  if (!c) return mockListCashouts(vendorId);
  const { data, error } = await c
    .from("cashout_orders")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbCashoutOrder));
}

export async function getCashout(id: Hex): Promise<CashoutOrder | null> {
  const c = await tryDb();
  if (!c) return mockGetCashout(id);
  const { data, error } = await c
    .from("cashout_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbCashoutOrder) : null;
}

export async function createCashout(
  input: Omit<CashoutOrder, "id" | "status" | "requestedAt" | "timeline">,
  opts?: {
    /**
     * Bind the row to a caller-supplied id. Live on-chain path passes the
     * `cashoutId` it signed into `CashoutOrderProcessor.requestAndLock` so the
     * daemon (which keys on `cashout_orders.id == on-chain cashoutId`) can
     * resolve + advance the order. Must be a 0x-prefixed 32-byte hash.
     */
    id?: Hex;
    /** Initial status. Live path opens at LOCKED (USDC already escrowed on-chain). */
    status?: CashoutStatus;
  },
): Promise<CashoutOrder> {
  const c = await tryDb();
  if (!c) return mockCreateCashout(input);
  // previously used
  // `Math.random().toString(16)` for the cashout id — 52-bit Math.random
  // entropy was both collision-risky under concurrent vendor load AND
  // predictable enough that an attacker could grind a few seconds of
  // PRNG state to guess fresh order IDs and front-run dispute opens
  // (chains with the DisputeManager hijack closed ). Now uses
  // `crypto.randomBytes(32)` — 256 bits of CSPRNG entropy.
  let id = opts?.id;
  if (id && !/^0x[0-9a-fA-F]{64}$/.test(id)) {
    throw new Error("createCashout: opts.id must be a 0x 32-byte hash");
  }
  if (!id) {
    const { randomBytes } = await import("node:crypto");
    id = ("0x" + randomBytes(32).toString("hex")) as Hex;
  }
  const { data, error } = await c
    .from("cashout_orders")
    .insert({
      id,
      vendor_id: input.vendorId,
      vendor_wallet: input.vendorWallet,
      usdc_amount: input.usdcAmount.toString(),
      payout_minor: input.payoutMinor.toString(),
      currency: input.currency,
      klaro_fee_usdc: input.klaroFeeUsdc.toString(),
      lp_spread_usdc: input.lpSpreadUsdc.toString(),
      quote_rate: input.quoteRate.toString(),
      quote_hash: input.quoteHash,
      quote_expires_at: input.quoteExpiresAt.toISOString(),
      ...(opts?.status ? { status: opts.status } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as DbCashoutOrder);
}

/// callers used to `getCashout` →
/// check status → `advanceCashout` without a conditional update, which
/// raced two concurrent claims to the same order (both read REQUESTED,
/// both `update` succeeded, the second silently overwrote the first
/// LP's claim). `advanceCashout` now requires `requireFromStatus`; the
/// underlying UPDATE is atomic on `(id, status)` and returns null when
/// the row's status no longer matches — callers must treat null as
/// "lost the race" and surface it to the user.
export async function advanceCashout(
  id: Hex,
  to: CashoutStatus,
  event: CashoutTimelineEvent,
  patch?: Partial<CashoutOrder>,
  requireFromStatus?: CashoutStatus,
): Promise<CashoutOrder | null> {
  const c = await tryDb();
  if (!c) return mockAdvanceCashout(id, to, event, patch, requireFromStatus);
  const update: Record<string, unknown> = { status: to };
  if (patch?.lpId) update.lp_id = patch.lpId;
  if (patch?.lpName) update.lp_name = patch.lpName;
  if (patch?.proofHash) update.proof_hash = patch.proofHash;
  if (patch?.utrReference) update.utr_reference = patch.utrReference;
  if (
    to === "RESOLVED_LP_PAYS" ||
    to === "RESOLVED_VENDOR_PAYS" ||
    to === "RELEASED" ||
    to === "CANCELLED" ||
    to === "EXPIRED"
  ) {
    update.resolved_at = new Date().toISOString();
  }
  let q = c.from("cashout_orders").update(update).eq("id", id);
  if (requireFromStatus !== undefined) {
    q = q.eq("status", requireFromStatus);
  }
  const { data, error } = await q.select().maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbCashoutOrder) : null;
}
