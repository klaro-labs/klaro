"use server";

import { revalidatePath } from "next/cache";
import {
  mockGetAgent,
  type AgentJobStatus,
} from "@/lib/mockData";
import * as agentJobsRepo from "@/lib/repo/agentJobs";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import { record as auditRecord } from "@/lib/auditLog";
import { dollarsToUSDC, assertSafeUSDAmount } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * Agent job actions.
 * - `createJobAction` used `getCurrentSession()` (no role gate) and didn't
 * assert the vendor's wallet was provisioned — funding the on-chain
 * escrow with a 0x000…000 principal would have stranded USDC.
 * - `advanceJobAction` had **zero auth + zero ownership check**. Anyone
 * with a jobId could advance any job to any state — including CLOSED,
 * which on chain triggers `usdc.safeTransfer(agent, amountUsdc)`. Same
 * class as the retainer/withdraw P0 fixed in .
 */

export async function createJobAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  assertVendorWalletProvisioned(session.vendor);
  const agentId = String(formData.get("agentId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "");
  if (!agentId.startsWith("0x")) throw new Error("validation_agentId_required");
  assertSafeUSDAmount(amount);
  if (description.length < 10)
    throw new Error("validation_brief_too_short: must be ≥ 10 chars");

  try {
    const agent = await mockGetAgent(agentId);
    if (!agent) throw new Error("unknown agent");
    // previously a vendor could hire an
    // inactive agent — the simulator would `mockCreateAgentJob` happily, but
    // on chain `AgentRegistry.active(agentId) == false` would make
    // `AgentEscrow.createJob` revert. We close the gap server-side so the
    // simulator path matches on-chain behavior and the user gets a clear
    // error instead of a stuck job that can never advance.
    if (!agent.active) throw new Error("agent is inactive — pick another");

    const job = await agentJobsRepo.createJob({
      vendorId: session.vendor.id,
      agentId,
      agentLabel: agent.displayName,
      amountUsdc: dollarsToUSDC(amount),
      feeBps: agent.feeBps,
      description,
    });
    auditRecord({
      actor: session.vendor.id,
      // F-2: was "agent.reactivate" (wrong code; audit log lied).
      action: "agent.create_job",
      subjectKind: "agent",
      subjectId: agentId,
      noteMd: `Created job ${job.jobId} (${amount} USDC)`,
    });
    revalidatePath("/vendor/agents");
  } catch (e) {
    captureError(e, {
      action: "agent.createJob",
      vendorId: session.vendor.id,
      agentId,
    });
    throw e;
  }
}

// legal next states per current status.
// Previously `advanceJobAction` accepted any `to` — vendor (or anyone bypassing
// the UI) could skip CREATED → CLOSED, releasing escrow without
// `submitDeliverable` ever firing. The real on-chain `AgentEscrow` would
// revert; the simulator silently agreed. Now both layers enforce the same
// state machine, satisfying Klaro principle #9 (money flows must be state
// machines with no undefined transitions).
const LEGAL_NEXT: Record<AgentJobStatus, ReadonlyArray<AgentJobStatus>> = {
  CREATED: ["FUNDED", "CANCELLED"],
  FUNDED: ["STARTED", "CANCELLED"],
  STARTED: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["CLOSED", "DISPUTED"],
  DISPUTED: [], // only admin resolution exits DISPUTED
  CLOSED: [], // terminal
  CANCELLED: [], // terminal
};

export async function advanceJobAction(
  jobId: string,
  to: AgentJobStatus,
  patch?: { deliverableHash?: Hex },
): Promise<void> {
  const session = await requireVendor();
  try {
    const job = await agentJobsRepo.getJob(jobId);
    if (!job) throw new Error("job not found");
    if (job.vendorId !== session.vendor.id)
      throw new Error("job belongs to a different vendor");
    if (!LEGAL_NEXT[job.status].includes(to)) {
      throw new Error(`illegal transition: ${job.status} → ${to}`);
    }
    // DELIVERED requires the deliverable hash so receipts have something to
    // anchor. Without it the agent is paid for nothing.
    if (to === "DELIVERED" && !patch?.deliverableHash) {
      throw new Error("deliverableHash required to mark DELIVERED");
    }
    await agentJobsRepo.advanceJob(jobId, to, patch);
    auditRecord({
      actor: session.vendor.id,
      // F-2: was "agent.reactivate" (wrong code; audit log lied).
      action: "agent.advance_job",
      subjectKind: "agent",
      subjectId: job.agentId,
      noteMd: `Advanced job ${jobId} → ${to}`,
    });
    revalidatePath("/vendor/agents");
  } catch (e) {
    captureError(e, {
      action: "agent.advanceJob",
      vendorId: session.vendor.id,
      jobId,
    });
    throw e;
  }
}
