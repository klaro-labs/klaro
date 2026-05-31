/**
 * disputes repo — LIVE Supabase branch (two-table write, enum columns, evidence
 * hydration join, status transitions under RLS). openDispute writes BOTH a
 * `disputes` row and a `dispute_evidence` row; getByContext reads the case and
 * hydrates its evidence via a second query; addEvidence appends + flips status.
 * None of this — the klaro_actor_kind enums, the FK'd evidence table, the
 * hydration mapping — is exercised by the mock-only unit tests.
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

const CASE = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REF = ("0x" + "cd".repeat(32)) as `0x${string}`;

describe.skipIf(!env.available)("disputes repo — live RLS branch", () => {
  let svc: SupabaseClient;
  let repo: typeof import("@/lib/repo/disputes");
  let disputeRowId: string | null = null;

  beforeAll(async () => {
    H.rls = await rlsClientForEmail(TEST_VENDOR.email);
    svc = serviceClient();
    repo = await import("@/lib/repo/disputes");
    // clean any prior run
    const { data } = await svc
      .from("disputes")
      .select("id")
      .eq("case_id", CASE)
      .maybeSingle();
    if (data) {
      await svc
        .from("dispute_evidence")
        .delete()
        .eq("dispute_id", (data as { id: string }).id);
      await svc.from("disputes").delete().eq("case_id", CASE);
    }
  }, 30_000);

  afterAll(async () => {
    if (svc && disputeRowId) {
      await svc
        .from("dispute_evidence")
        .delete()
        .eq("dispute_id", disputeRowId);
      await svc.from("disputes").delete().eq("case_id", CASE);
    }
  });

  it("openDispute writes the disputes row AND the opening dispute_evidence row", async () => {
    const c = await repo.openDispute({
      caseId: CASE,
      context: "agent",
      contextRefId: REF,
      vendorId: TEST_VENDOR.id,
      claimantLabel: "QA vendor",
      respondentLabel: "QA agent",
      amountUsdc: 200_000_000n,
      openingNote: "opening note",
      openingHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      respondentKind: "system",
    });
    expect(c.status).toBe("OPENED");
    const { data: row } = await svc
      .from("disputes")
      .select("id,source,claimant_kind,respondent_kind,status")
      .eq("case_id", CASE)
      .single();
    const d = row as {
      id: string;
      source: string;
      claimant_kind: string;
      respondent_kind: string;
      status: string;
    };
    disputeRowId = d.id;
    expect(d.source).toBe("agent");
    expect(d.claimant_kind).toBe("vendor");
    expect(d.respondent_kind).toBe("system");
    // the second-table write landed
    const { count } = await svc
      .from("dispute_evidence")
      .select("*", { count: "exact", head: true })
      .eq("dispute_id", d.id);
    expect(count).toBe(1);
  });

  it("getByContext reads the case + hydrates the opening evidence (join)", async () => {
    const found = await repo.getByContext("agent", REF);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("OPENED");
    // hydrate() pulled the dispute_evidence row into the case
    expect(found!.evidence.length).toBeGreaterThanOrEqual(1);
  });

  it("addEvidence appends evidence + flips status to EVIDENCE_SUBMITTED", async () => {
    const updated = await repo.addEvidence(CASE, {
      by: "claimant",
      at: new Date(),
      note: "more evidence",
      hash: ("0x" + "22".repeat(32)) as `0x${string}`,
    });
    expect(updated!.status).toBe("EVIDENCE_SUBMITTED");
    const { count } = await svc
      .from("dispute_evidence")
      .select("*", { count: "exact", head: true })
      .eq("dispute_id", disputeRowId!);
    expect(count).toBe(2);
  });
});
