/**
 * cashouts repo — LIVE Supabase branch (RLS, real columns, atomic precondition).
 * Mock unit tests force tryDb→null and never run this SQL. Here `tryDb()` points
 * at a real client authenticated AS the test vendor, so we verify: the row maps
 * (numeric→bigint), and `advanceCashout`'s conditional `requireFromStatus` is a
 * true compare-and-swap — a stale from-status matches 0 rows and returns null
 * (no clobber), the correct one advances. That CAS is the cashout claim race
 * guard and was previously unverified against an actual database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  liveEnv,
  serviceClient,
  rlsClientForEmail,
  TEST_VENDOR,
} from "./helpers/liveDb";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = liveEnv();

const H = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rls: null as any,
}));
vi.mock("@/lib/db", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, tryDb: async () => H.rls };
});

const ORDER_ID =
  "0x00000000000000000000000000000000000000000000000000000000cab17e51";

describe.skipIf(!env.available)("cashouts repo — live RLS branch", () => {
  let svc: SupabaseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: typeof import("@/lib/repo/cashouts");

  beforeAll(async () => {
    H.rls = await rlsClientForEmail(TEST_VENDOR.email);
    svc = serviceClient();
    repo = await import("@/lib/repo/cashouts");
    await svc.from("cashout_orders").delete().eq("id", ORDER_ID);
    const now = new Date().toISOString();
    const { error } = await svc.from("cashout_orders").insert({
      id: ORDER_ID,
      vendor_id: TEST_VENDOR.id,
      vendor_wallet: TEST_VENDOR.wallet,
      usdc_amount: 2_400_000_000,
      payout_minor: 19_920_000,
      currency: "INR",
      klaro_fee_usdc: 12_000_000,
      lp_spread_usdc: 6_000_000,
      quote_rate: 83,
      quote_hash: "0x" + "11".repeat(32),
      status: "LOCKED",
      requested_at: now,
      quote_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      updated_at: now,
    });
    if (error) throw new Error(`seed failed: ${error.message}`);
  }, 30_000);

  afterAll(async () => {
    if (svc) await svc.from("cashout_orders").delete().eq("id", ORDER_ID);
  });

  it("getCashout reads the live row + coerces numeric→bigint on real columns", async () => {
    const o = await repo.getCashout(ORDER_ID as `0x${string}`);
    expect(o).not.toBeNull();
    expect(o!.id).toBe(ORDER_ID);
    expect(o!.usdcAmount).toBe(2_400_000_000n);
    expect(o!.payoutMinor).toBe(19_920_000n);
    expect(o!.currency).toBe("INR");
    expect(o!.status).toBe("LOCKED");
  });

  it("advanceCashout CAS: a stale from-status matches 0 rows → null (no clobber)", async () => {
    const lost = await repo.advanceCashout(
      ORDER_ID as `0x${string}`,
      "CLAIMED",
      { kind: "lp_assigned", at: new Date(), detail: "x" },
      undefined,
      "REQUESTED", // actual is LOCKED → precondition fails
    );
    expect(lost).toBeNull();
    // row untouched
    const still = await repo.getCashout(ORDER_ID as `0x${string}`);
    expect(still!.status).toBe("LOCKED");
  });

  it("advanceCashout CAS: the correct from-status advances + persists the patch", async () => {
    // NB: lp_id is FK-constrained (cashout_orders_lp_id_fkey → lp_profiles) — a
    // real-schema constraint mock tests never exercise — so patch a non-FK
    // column (proof_hash / utr_reference) to prove the patch→column mapping.
    const proof = ("0x" + "ab".repeat(32)) as `0x${string}`;
    const ok = await repo.advanceCashout(
      ORDER_ID as `0x${string}`,
      "PROOF_SUBMITTED",
      { kind: "proof_submitted", at: new Date(), detail: "proof" },
      { proofHash: proof, utrReference: "UTRLIVE1" },
      "LOCKED",
    );
    expect(ok).not.toBeNull();
    expect(ok!.status).toBe("PROOF_SUBMITTED");
    expect(ok!.proofHash).toBe(proof);
    expect(ok!.utrReference).toBe("UTRLIVE1");
    // verified independently via service-role read (real columns)
    const { data } = await svc
      .from("cashout_orders")
      .select("status,proof_hash,utr_reference")
      .eq("id", ORDER_ID)
      .single();
    const row = data as { status: string; proof_hash: string; utr_reference: string };
    expect(row.status).toBe("PROOF_SUBMITTED");
    expect(row.proof_hash).toBe(proof);
    expect(row.utr_reference).toBe("UTRLIVE1");
  });
});
