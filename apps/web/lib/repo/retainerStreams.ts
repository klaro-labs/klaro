/**
 * Retainer-stream repository — dual-mode (Supabase live · mockData fallback).
 * Persists the stream RECORD + its vesting accounting to `retainer_streams`
 * (0041) so a created stream, a withdrawal, or a cancel survives a cold start in
 * live mode. The on-chain `RetainerStream.createStream()` funding leg is
 * partner-pending — the *client* (payer) is not present in the single-vendor
 * dashboard to sign the approve+fund tx — so the vesting shown is a local linear
 * SIMULATION, which the page labels honestly (no "funds locked on-chain" claim).
 *
 * USDC micro-amounts persist as numeric(78,0) and come back as decimal strings;
 * we round-trip them through BigInt so no precision is lost.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryDb } from "../db";
import {
  mockListStreams,
  mockGetStream,
  mockCreateStream,
  mockWithdrawFromStream,
  mockCancelStream,
  withdrawableAmountFor,
  vestedAmountFor,
  type RetainerStreamRecord,
} from "../mockData";
import type { Hex } from "../types";

// `retainer_streams` is new (0041) and not in the generated Database type yet,
// so reach it through the untyped client surface.
const rs = (c: NonNullable<Awaited<ReturnType<typeof tryDb>>>) =>
  (c as unknown as SupabaseClient).from("retainer_streams");

type Row = Record<string, unknown>;
const big = (v: unknown): bigint => BigInt(String(v ?? "0"));

function fromRow(row: Row): RetainerStreamRecord {
  return {
    streamId: String(row.stream_id) as Hex,
    vendorId: String(row.vendor_id),
    payerLabel: String(row.payer_label),
    payerAddress: String(row.payer_address) as Hex,
    recipientAddress: String(row.recipient_address) as Hex,
    depositUsdc: big(row.deposit_usdc),
    withdrawnUsdc: big(row.withdrawn_usdc),
    startAt: new Date(String(row.start_at)),
    endAt: new Date(String(row.end_at)),
    cancelledAt: row.cancelled_at
      ? new Date(String(row.cancelled_at))
      : undefined,
    cancelledVested:
      row.cancelled_vested != null ? big(row.cancelled_vested) : undefined,
  };
}

export async function listStreams(
  vendorId: string,
): Promise<RetainerStreamRecord[]> {
  const c = await tryDb();
  if (!c) return mockListStreams(vendorId);
  const { data, error } = await rs(c)
    .select("*")
    .eq("vendor_id", vendorId)
    .order("start_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getStream(id: Hex): Promise<RetainerStreamRecord | null> {
  const c = await tryDb();
  if (!c) return mockGetStream(id);
  const { data, error } = await rs(c)
    .select("*")
    .eq("stream_id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function createStream(input: {
  vendorId: string;
  payerLabel: string;
  payerAddress: Hex;
  recipientAddress: Hex;
  depositUsdc: bigint;
  startAt: Date;
  endAt: Date;
}): Promise<RetainerStreamRecord> {
  const c = await tryDb();
  if (!c) return mockCreateStream(input);
  const streamId = ("0x" + randomBytes(32).toString("hex")) as Hex;
  const { data, error } = await rs(c)
    .insert({
      stream_id: streamId,
      vendor_id: input.vendorId,
      payer_label: input.payerLabel,
      payer_address: input.payerAddress,
      recipient_address: input.recipientAddress,
      deposit_usdc: input.depositUsdc.toString(),
      withdrawn_usdc: "0",
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/** Withdraw vested-but-unwithdrawn USDC. Re-reads the row and recomputes the
 * vested ceiling server-side so a stale client amount can't over-withdraw. */
export async function withdrawFromStream(
  id: Hex,
  amount: bigint,
): Promise<bigint> {
  const c = await tryDb();
  if (!c) return mockWithdrawFromStream(id, amount);
  const stream = await getStream(id);
  if (!stream) throw new Error("unknown stream");
  if (stream.cancelledAt) throw new Error("stream is cancelled");
  const withdrawable = withdrawableAmountFor(stream);
  if (amount <= 0n) throw new Error("amount must be positive");
  if (amount > withdrawable)
    throw new Error(`amount ${amount} exceeds withdrawable ${withdrawable}`);
  const next = stream.withdrawnUsdc + amount;
  const { error } = await rs(c)
    .update({ withdrawn_usdc: next.toString() })
    .eq("stream_id", id)
    .is("cancelled_at", null);
  if (error) throw error;
  return amount;
}

/** Cancel a stream. Freezes vesting at the current vested amount so the
 * recipient keeps what they earned (mirrors the contract's pro-rata refund). */
export async function cancelStream(
  id: Hex,
): Promise<RetainerStreamRecord | null> {
  const c = await tryDb();
  if (!c) return mockCancelStream(id);
  const stream = await getStream(id);
  if (!stream) return null;
  if (stream.cancelledAt) return stream;
  const vested = vestedAmountFor(stream);
  const { data, error } = await rs(c)
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_vested: vested.toString(),
    })
    .eq("stream_id", id)
    .is("cancelled_at", null)
    .select()
    .single();
  if (error) throw error;
  return data ? fromRow(data as Row) : stream;
}
