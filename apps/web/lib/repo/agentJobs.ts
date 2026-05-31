/**
 * Agent-job repository — dual-mode (Supabase live · mockData fallback).
 * Maps the AgentJob app model onto the 0005 agent_jobs table (label/description
 * added in 0033). The on-chain AgentEscrow state machine is enforced in the
 * action layer; this layer persists.
 */
import { tryDb } from "../db";
import type { TablesInsert, TablesUpdate } from "../database.types";
import {
  mockGetAgentJob,
  mockListAgentJobs,
  mockCreateAgentJob,
  mockAdvanceAgentJob,
  type AgentJob,
  type AgentJobStatus,
} from "../mockData";
import type { Hex } from "../types";

const numericToBigInt = (v: string | number | null): bigint =>
  v == null ? 0n : BigInt(String(v).replace(/\.\d+$/, ""));

type Row = Record<string, unknown>;

function fromRow(row: Row): AgentJob {
  return {
    jobId: String(row.job_id),
    vendorId: String(row.vendor_id),
    agentId: String(row.agent_id),
    agentLabel: String(row.agent_label ?? "Agent"),
    amountUsdc: numericToBigInt(row.amount_usdc as string | number | null),
    feeUsdc: numericToBigInt(row.fee_usdc as string | number | null),
    description: String(row.description ?? ""),
    deliverableHash: (row.deliverable_hash ?? undefined) as Hex | undefined,
    status: String(row.status) as AgentJobStatus,
    createdAt: new Date(String(row.created_at)),
    fundedAt: row.funded_at ? new Date(String(row.funded_at)) : undefined,
    startedAt: row.started_at ? new Date(String(row.started_at)) : undefined,
    completedAt: row.delivered_at
      ? new Date(String(row.delivered_at))
      : row.closed_at
        ? new Date(String(row.closed_at))
        : undefined,
  };
}

export async function getJob(jobId: string): Promise<AgentJob | null> {
  const c = await tryDb();
  if (!c) return mockGetAgentJob(jobId);
  const { data, error } = await c
    .from("agent_jobs")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function listForVendor(vendorId: string): Promise<AgentJob[]> {
  const c = await tryDb();
  if (!c) return mockListAgentJobs(vendorId);
  const { data, error } = await c
    .from("agent_jobs")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function createJob(input: {
  vendorId: string;
  agentId: string;
  agentLabel: string;
  amountUsdc: bigint;
  feeBps: number;
  description: string;
}): Promise<AgentJob> {
  const c = await tryDb();
  if (!c) return mockCreateAgentJob(input);
  const { randomBytes } = await import("node:crypto");
  const jobId = ("0x" + randomBytes(32).toString("hex")) as Hex;
  const feeUsdc = (input.amountUsdc * BigInt(input.feeBps)) / 10_000n;
  const payload = {
    job_id: jobId,
    vendor_id: input.vendorId,
    agent_id: input.agentId,
    agent_label: input.agentLabel,
    amount_usdc: input.amountUsdc.toString(),
    fee_usdc: feeUsdc.toString(),
    description: input.description,
    status: "CREATED",
  } as unknown as TablesInsert<"agent_jobs">;
  const { data, error } = await c
    .from("agent_jobs")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

const STATUS_TS: Record<string, string> = {
  FUNDED: "funded_at",
  STARTED: "started_at",
  DELIVERED: "delivered_at",
  CLOSED: "closed_at",
};

export async function advanceJob(
  jobId: string,
  to: AgentJobStatus,
  fromStatus: AgentJobStatus,
  patch?: { deliverableHash?: Hex },
): Promise<AgentJob | null> {
  const c = await tryDb();
  if (!c) return mockAdvanceAgentJob(jobId, to, patch);
  const update: Record<string, unknown> = { status: to };
  const tsCol = STATUS_TS[to];
  if (tsCol) update[tsCol] = new Date().toISOString();
  if (patch?.deliverableHash) update.deliverable_hash = patch.deliverableHash;
  // Atomic precondition: only transition if the row is still in fromStatus.
  // Guards the TOCTOU between the action's read and this write — a concurrent
  // advance loses the race and gets a null row back (caller treats as failure).
  const { data, error } = await c
    .from("agent_jobs")
    .update(update as unknown as TablesUpdate<"agent_jobs">)
    .eq("job_id", jobId)
    .eq("status", fromStatus)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}
