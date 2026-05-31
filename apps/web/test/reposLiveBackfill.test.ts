/**
 * Live-branch backfill for the previously untested repos: team (klaro_role enum
 * round-trip + soft-remove), delegations, fxQuotes, retainerStreams. Each runs
 * its real SQL against live Supabase as the test vendor (RLS), proving the
 * dual-mode wrappers persist + read back through the real columns — the branch
 * the mock unit tests skip. All seeded rows are cleaned up by id.
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

let svc: SupabaseClient;

beforeAll(async () => {
  if (!env.available) return;
  H.rls = await rlsClientForEmail(TEST_VENDOR.email);
  svc = serviceClient();
}, 30_000);

describe.skipIf(!env.available)("team repo — live RLS branch", () => {
  let repo: typeof import("@/lib/repo/team");
  let memberId: string;

  beforeAll(async () => {
    repo = await import("@/lib/repo/team");
  });
  afterAll(async () => {
    if (svc && memberId)
      await svc.from("vendor_team_members").delete().eq("id", memberId);
  });

  it("invite → changeRole round-trips the klaro_role enum; remove soft-deletes", async () => {
    const email = `qa.live.${Date.now()}@klaro.test`;
    const m = await repo.inviteTeammate({
      vendorId: TEST_VENDOR.id,
      email,
      role: "Admin",
    });
    memberId = m.id;
    expect(m.role).toBe("Admin"); // app role survives the TO_DB/fromRow enum map

    const changed = await repo.changeRole(memberId, "Member");
    expect(changed!.role).toBe("Member");

    await repo.removeTeammate(memberId);
    const team = await repo.listTeam(TEST_VENDOR.id);
    expect(team.some((t) => t.id === memberId)).toBe(false); // removed_at hides it
  });
});

describe.skipIf(!env.available)("delegations repo — live RLS branch", () => {
  let repo: typeof import("@/lib/repo/delegations");
  let keyId: string;

  beforeAll(async () => {
    repo = await import("@/lib/repo/delegations");
  });
  afterAll(async () => {
    if (svc && keyId) await svc.from("session_keys").delete().eq("id", keyId);
  });

  it("createSessionKey persists; revoke sets revoked_at + drops from the active list", async () => {
    const key = await repo.createSessionKey({
      vendorId: TEST_VENDOR.id,
      delegateAddress: "0x000000000000000000000000000000000000dEaD",
      label: `QA live ${Date.now()}`,
      scope: "CASHOUT_REQUEST",
      ttlHours: 24,
    });
    keyId = key.id;
    expect(key.scope).toBe("CASHOUT_REQUEST");

    await repo.revokeSessionKey(keyId, TEST_VENDOR.id);
    const active = await repo.listSessionKeys(TEST_VENDOR.id);
    expect(active.some((k) => k.id === keyId)).toBe(false);
    const { data } = await svc
      .from("session_keys")
      .select("revoked_at")
      .eq("id", keyId)
      .single();
    expect((data as { revoked_at: string | null }).revoked_at).not.toBeNull();
  });
});

describe.skipIf(!env.available)("fxQuotes repo — live RLS branch", () => {
  let repo: typeof import("@/lib/repo/fxQuotes");
  let quoteId: string;

  beforeAll(async () => {
    repo = await import("@/lib/repo/fxQuotes");
  });
  afterAll(async () => {
    if (svc && quoteId) await svc.from("fx_quotes").delete().eq("id", quoteId);
  });

  it("createFxQuote persists (numeric→bigint); settle flips status + settled_at", async () => {
    const q = await repo.createFxQuote({
      vendorId: TEST_VENDOR.id,
      srcToken: "USDC",
      dstToken: "USYC",
      srcAmountUsdc: 1_500_000_000n,
      rate: 0.998,
      status: "simulated",
    });
    quoteId = q.id;
    expect(q.srcAmountUsdc).toBe(1_500_000_000n);
    expect(q.status).toBe("simulated");

    const settled = await repo.settleFxQuote(quoteId, TEST_VENDOR.id);
    expect(settled!.status).toBe("settlement complete");
    expect(settled!.settledAt).toBeInstanceOf(Date);
  });
});

describe.skipIf(!env.available)(
  "retainerStreams repo — live RLS branch",
  () => {
    let repo: typeof import("@/lib/repo/retainerStreams");
    let streamId: string;

    beforeAll(async () => {
      repo = await import("@/lib/repo/retainerStreams");
    });
    afterAll(async () => {
      if (svc && streamId)
        await svc.from("retainer_streams").delete().eq("stream_id", streamId);
    });

    it("createStream persists numeric(78,0) micro-USDC; cancel freezes vested", async () => {
      const stream = await repo.createStream({
        vendorId: TEST_VENDOR.id,
        payerLabel: `QA live ${Date.now()}`,
        payerAddress: "0x000000000000000000000000000000000000dEaD",
        recipientAddress: TEST_VENDOR.wallet as `0x${string}`,
        depositUsdc: 9_000_000_000n,
        startAt: new Date(Date.now() - 10 * 86_400_000),
        endAt: new Date(Date.now() + 20 * 86_400_000),
      });
      streamId = stream.streamId;
      expect(stream.depositUsdc).toBe(9_000_000_000n); // round-trips through numeric(78,0)

      const cancelled = await repo.cancelStream(
        stream.streamId as `0x${string}`,
      );
      expect(cancelled!.cancelledAt).toBeInstanceOf(Date);
      expect(cancelled!.cancelledVested).toBeGreaterThan(0n); // ~1/3 vested, frozen
    });
  },
);
