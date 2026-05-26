// Regression test for loop (2026-05-25): agent-job state-machine
// guard in vendor/agents/actions.ts. Imports the action via cookie-stubbed
// requireVendor so we can exercise the transition table without a full HTTP
// request. The action layer is the one place both UI clicks and direct
// invocations funnel through, so guarding here matches what the on-chain
// AgentEscrow already enforces.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mockCreateAgentJob,
  mockGetAgentJob,
  mockListAgents,
} from "@/lib/mockData";
import { dollarsToUSDC } from "@/lib/money";
import type { Hex } from "@/lib/types";
import { keccak256, stringToBytes } from "viem";

const VENDOR_ID = "vendor-asha";

vi.mock("@/lib/auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...real,
    requireVendor: vi.fn(async () => ({
      vendor: {
        id: VENDOR_ID,
        displayName: "Asha",
        wallet: ("0x" + "ab".repeat(20)) as Hex,
        country: "IN",
      },
    })),
    assertVendorWalletProvisioned: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/auditLog", () => ({ record: vi.fn() }));

async function seedJob() {
  const agentId = ("0xa9" + "0".repeat(62)) as Hex;
  const job = await mockCreateAgentJob({
    vendorId: VENDOR_ID,
    agentId,
    agentLabel: "Pricing Scout",
    amountUsdc: dollarsToUSDC(100),
    feeBps: 250,
    description: "Test job for state-machine guard",
  });
  return job;
}

describe("agent job state-machine guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects CREATED → CLOSED (skip funding + delivery)", async () => {
    const { advanceJobAction } = await import("@/app/vendor/agents/actions");
    const job = await seedJob();
    await expect(advanceJobAction(job.jobId, "CLOSED")).rejects.toThrow(
      /illegal transition/,
    );
    const after = await mockGetAgentJob(job.jobId);
    expect(after?.status).toBe("CREATED");
  });

  it("rejects DELIVERED without deliverableHash", async () => {
    const { advanceJobAction } = await import("@/app/vendor/agents/actions");
    const job = await seedJob();
    await advanceJobAction(job.jobId, "FUNDED");
    await advanceJobAction(job.jobId, "STARTED");
    await expect(advanceJobAction(job.jobId, "DELIVERED")).rejects.toThrow(
      /deliverableHash required/,
    );
  });

  it("walks the happy path CREATED → FUNDED → STARTED → DELIVERED → CLOSED", async () => {
    const { advanceJobAction } = await import("@/app/vendor/agents/actions");
    const job = await seedJob();
    const dHash = keccak256(stringToBytes("deliverable-bytes")) as Hex;
    await advanceJobAction(job.jobId, "FUNDED");
    await advanceJobAction(job.jobId, "STARTED");
    await advanceJobAction(job.jobId, "DELIVERED", { deliverableHash: dHash });
    await advanceJobAction(job.jobId, "CLOSED");
    const after = await mockGetAgentJob(job.jobId);
    expect(after?.status).toBe("CLOSED");
    expect(after?.deliverableHash).toBe(dHash);
  });

  it("createJobAction rejects inactive agents (iter 19 regression)", async () => {
    // Pick a seeded active agent then patch it inactive via a one-off spy.
    const agents = await mockListAgents();
    const target = agents[0];
    const mocked = await import("@/lib/mockData");
    const spy = vi
      .spyOn(mocked, "mockGetAgent")
      .mockResolvedValue({ ...target, active: false });
    try {
      const { createJobAction } = await import("@/app/vendor/agents/actions");
      const fd = new FormData();
      fd.set("agentId", target.agentId);
      fd.set("amount", "100");
      fd.set("description", "ten-char minimum brief here");
      await expect(createJobAction(fd)).rejects.toThrow(/inactive/);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects transitions out of CLOSED (terminal)", async () => {
    const { advanceJobAction } = await import("@/app/vendor/agents/actions");
    const job = await seedJob();
    const dHash = keccak256(stringToBytes("deliverable-bytes")) as Hex;
    await advanceJobAction(job.jobId, "FUNDED");
    await advanceJobAction(job.jobId, "STARTED");
    await advanceJobAction(job.jobId, "DELIVERED", { deliverableHash: dHash });
    await advanceJobAction(job.jobId, "CLOSED");
    await expect(advanceJobAction(job.jobId, "CANCELLED")).rejects.toThrow(
      /illegal transition/,
    );
  });
});
