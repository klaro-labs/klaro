/**
 * agentJobs repo — LIVE Supabase branch (RLS insert + CAS state machine).
 * Verifies createJob actually inserts as the vendor (real columns + the
 * fee-from-bps math persisted), and advanceJob's atomic `fromStatus`
 * compare-and-swap — the TOCTOU guard between an action's read and its write —
 * behaves as a CAS against a real DB: a stale fromStatus returns null (no
 * clobber), the correct one advances and stamps the lifecycle timestamp column.
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

describe.skipIf(!env.available)("agentJobs repo — live RLS branch", () => {
  let svc: SupabaseClient;
  let repo: typeof import("@/lib/repo/agentJobs");
  let jobId: string;

  beforeAll(async () => {
    H.rls = await rlsClientForEmail(TEST_VENDOR.email);
    svc = serviceClient();
    repo = await import("@/lib/repo/agentJobs");
  }, 30_000);

  afterAll(async () => {
    if (svc && jobId) await svc.from("agent_jobs").delete().eq("job_id", jobId);
  });

  it("createJob inserts as the vendor + persists fee = amount × feeBps / 10000", async () => {
    const job = await repo.createJob({
      vendorId: TEST_VENDOR.id,
      agentId: "0x" + "a9".repeat(32),
      agentLabel: "QA live agent",
      amountUsdc: 200_000_000n,
      feeBps: 500,
      description: "live-branch test job",
    });
    jobId = job.jobId;
    expect(job.status).toBe("CREATED");
    expect(job.amountUsdc).toBe(200_000_000n);
    expect(job.feeUsdc).toBe(10_000_000n); // 200 × 5% = 10 USDC
    // independently confirm the row exists with real columns
    const { data } = await svc
      .from("agent_jobs")
      .select("vendor_id,status,amount_usdc")
      .eq("job_id", jobId)
      .single();
    expect((data as { vendor_id: string }).vendor_id).toBe(TEST_VENDOR.id);
  });

  it("advanceJob CAS: a stale fromStatus → null (no clobber)", async () => {
    const lost = await repo.advanceJob(jobId, "FUNDED", "DELIVERED"); // actual is CREATED
    expect(lost).toBeNull();
    const still = await repo.getJob(jobId);
    expect(still!.status).toBe("CREATED");
  });

  it("advanceJob CAS: the correct fromStatus advances + stamps the timestamp column", async () => {
    const ok = await repo.advanceJob(jobId, "FUNDED", "CREATED");
    expect(ok!.status).toBe("FUNDED");
    const { data } = await svc
      .from("agent_jobs")
      .select("status,funded_at")
      .eq("job_id", jobId)
      .single();
    const row = data as { status: string; funded_at: string | null };
    expect(row.status).toBe("FUNDED");
    expect(row.funded_at).not.toBeNull(); // STATUS_TS["FUNDED"] = funded_at
  });

  it("advanceJob persists a deliverable_hash patch through the real column", async () => {
    await repo.advanceJob(jobId, "STARTED", "FUNDED");
    const hash = ("0x" + "de".repeat(32)) as `0x${string}`;
    const ok = await repo.advanceJob(jobId, "DELIVERED", "STARTED", {
      deliverableHash: hash,
    });
    expect(ok!.status).toBe("DELIVERED");
    const { data } = await svc
      .from("agent_jobs")
      .select("deliverable_hash")
      .eq("job_id", jobId)
      .single();
    expect((data as { deliverable_hash: string }).deliverable_hash).toBe(hash);
  });
});
