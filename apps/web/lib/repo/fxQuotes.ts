/**
 * FX-quote repository — dual-mode (Supabase live · mockData fallback). Persists
 * the quote RECORD + its settlement status to `fx_quotes` (0042) so a quote and
 * its "Execute swap" result survive a cold start in live mode. The FX itself is
 * already labeled honestly on the page (simulated / access pending / live
 * testnet / demo completed): Circle StableFX (FxEscrow + Permit2) access is
 * partner-pending, so a settled quote means the demo flow completed, not an
 * on-chain swap. This repo only stops the records from disappearing.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryDb } from "../db";
import {
  mockListFxQuotes,
  mockGetFxQuote,
  mockCreateFxQuote,
  mockSettleFxQuote,
  type FxQuote,
  type FxStatus,
} from "../mockData";
import type { Hex } from "../types";

// `fx_quotes` is new (0042) and not in the generated Database type yet, so reach
// it through the untyped client surface.
const fx = (c: NonNullable<Awaited<ReturnType<typeof tryDb>>>) =>
  (c as unknown as SupabaseClient).from("fx_quotes");

type Row = Record<string, unknown>;
const big = (v: unknown): bigint => BigInt(String(v ?? "0"));

function fromRow(row: Row): FxQuote {
  return {
    id: String(row.id),
    vendorId: String(row.vendor_id),
    srcToken: String(row.src_token),
    dstToken: String(row.dst_token),
    srcAmountUsdc: big(row.src_amount_usdc),
    dstAmount: big(row.dst_amount),
    rate: Number(row.rate),
    expiresAt: new Date(String(row.expires_at)),
    quoteHash: String(row.quote_hash) as Hex,
    status: String(row.status) as FxStatus,
    createdAt: new Date(String(row.created_at)),
    settledAt: row.settled_at ? new Date(String(row.settled_at)) : undefined,
  };
}

export async function listFxQuotes(vendorId: string): Promise<FxQuote[]> {
  const c = await tryDb();
  if (!c) return mockListFxQuotes(vendorId);
  const { data, error } = await fx(c)
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getFxQuote(id: string): Promise<FxQuote | null> {
  const c = await tryDb();
  if (!c) return mockGetFxQuote(id);
  const { data, error } = await fx(c).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function createFxQuote(input: {
  vendorId: string;
  srcToken: string;
  dstToken: string;
  srcAmountUsdc: bigint;
  rate: number;
  status: FxStatus;
}): Promise<FxQuote> {
  const c = await tryDb();
  if (!c) return mockCreateFxQuote(input);
  const id = `fx_${randomBytes(6).toString("hex")}`;
  // Pure bigint: the old `Number(srcAmountUsdc) * rate` double path silently lost
  // precision past 2^53 for large amounts, writing a wrong vendor-facing dst_amount.
  // rate is a config number (≤6dp) → scale by 1e6, divide last (matches floor intent).
  const rateScaled = BigInt(Math.round(input.rate * 1_000_000));
  const dstAmount = (input.srcAmountUsdc * rateScaled) / 1_000_000n;
  const quoteHash = ("0x" + randomBytes(32).toString("hex")) as Hex;
  const expiresAt = new Date(Date.now() + 60_000);
  const { data, error } = await fx(c)
    .insert({
      id,
      vendor_id: input.vendorId,
      src_token: input.srcToken,
      dst_token: input.dstToken,
      src_amount_usdc: input.srcAmountUsdc.toString(),
      dst_amount: dstAmount.toString(),
      rate: input.rate,
      expires_at: expiresAt.toISOString(),
      quote_hash: quoteHash,
      status: input.status,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/** Settle a quote the vendor owns. "settlement complete" is the demo-flow
 * terminal state (no on-chain swap — StableFX access is partner-pending).
 * Scoped by vendor_id so a vendor can't settle another's quote. */
export async function settleFxQuote(
  id: string,
  vendorId: string,
): Promise<FxQuote | null> {
  const c = await tryDb();
  if (!c) return mockSettleFxQuote(id, vendorId);
  const { data, error } = await fx(c)
    .update({
      status: "settlement complete",
      settled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .neq("status", "settlement complete")
    .select()
    .maybeSingle();
  if (error) throw error;
  // No row updated → either not owned, or already settled. Return current state
  // (or null if it genuinely doesn't exist) so the caller can decide.
  return data ? fromRow(data as Row) : getFxQuote(id);
}
