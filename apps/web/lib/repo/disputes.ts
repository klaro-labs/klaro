/**
 * Dispute repository — dual-mode (Supabase live · mockData fallback).
 * Maps the flat DisputeCase app model onto the 0004 disputes + dispute_evidence
 * tables (parties stored as kind+id; labels/openingNote added in 0032). Vendor
 * is always the claimant. Reads/writes go through the RLS client (tryDb); the
 * daemon owns DECIDED via service-role on the on-chain Decided event.
 */
import { tryDb } from "../db";
import type { TablesInsert, TablesUpdate } from "../database.types";
import {
  mockOpenDispute,
  mockAddEvidence,
  mockAssignDisputeToReview,
  mockDecideDispute,
  mockGetDispute,
  mockGetDisputeByContext,
  mockListDisputesForVendor,
  mockListDisputesAll,
  mockListDisputesByStatus,
  type DisputeCase,
  type DisputeEvidenceItem,
  type DisputeContext,
  type DisputeStatus,
  type DisputeOutcome,
} from "../mockData";
import type { Hex } from "../types";

const numericToBigInt = (v: string | number | null): bigint =>
  v == null ? 0n : BigInt(String(v).replace(/\.\d+$/, ""));

const TS_OUTCOMES: DisputeOutcome[] = [
  "RELEASE_TO_CLAIMANT",
  "REFUND_TO_RESPONDENT",
  "SLASH_LP",
  "PENALIZE_VENDOR",
  "MUTUAL_RESOLVED",
];

type Row = Record<string, unknown>;

function evidenceFrom(rows: Row[]): DisputeEvidenceItem[] {
  return rows.map((r) => {
    const kind = String(r.submitter_kind ?? "");
    const by: DisputeEvidenceItem["by"] =
      kind === "operator" || kind === "admin"
        ? "operator"
        : kind === "lp"
          ? "respondent"
          : "claimant";
    return {
      by,
      at: new Date(String(r.submitted_at)),
      note: String(r.body_md ?? ""),
      hash: (r.attachment_hash ?? "0x") as Hex,
    };
  });
}

function caseFrom(row: Row, evidence: DisputeEvidenceItem[]): DisputeCase {
  const rawOutcome = row.outcome as string | null;
  const outcome =
    rawOutcome && TS_OUTCOMES.includes(rawOutcome as DisputeOutcome)
      ? (rawOutcome as DisputeOutcome)
      : undefined;
  return {
    caseId: row.case_id as Hex,
    context: String(row.source) as DisputeContext,
    contextRefId: row.source_id as Hex,
    vendorId: String(row.claimant_id),
    claimantLabel: String(row.claimant_label ?? "Vendor"),
    respondentLabel: String(row.respondent_label ?? "Counterparty"),
    amountUsdc: numericToBigInt(row.amount_usdc as string | number | null),
    openingNote: String(row.opening_note ?? ""),
    status: String(row.status) as DisputeStatus,
    outcome,
    decisionReasonHash: (row.decision_reason_hash ?? undefined) as
      | Hex
      | undefined,
    evidence,
    openedAt: new Date(String(row.opened_at)),
    updatedAt: new Date(String(row.updated_at)),
    decidedAt: row.decided_at ? new Date(String(row.decided_at)) : undefined,
  };
}

async function hydrate(
  c: NonNullable<Awaited<ReturnType<typeof tryDb>>>,
  disputeId: string,
): Promise<DisputeEvidenceItem[]> {
  const { data } = await c
    .from("dispute_evidence")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("submitted_at", { ascending: true });
  return evidenceFrom((data ?? []) as Row[]);
}

export async function listForVendor(vendorId: string): Promise<DisputeCase[]> {
  const c = await tryDb();
  if (!c) return mockListDisputesForVendor(vendorId);
  const { data, error } = await c
    .from("disputes")
    .select("*")
    .eq("claimant_id", vendorId)
    .is("deleted_at", null)
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => caseFrom(r, []));
}

export async function listAll(): Promise<DisputeCase[]> {
  const c = await tryDb();
  if (!c) return mockListDisputesAll();
  const { data, error } = await c
    .from("disputes")
    .select("*")
    .is("deleted_at", null)
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => caseFrom(r, []));
}

export async function listByStatus(
  ...statuses: DisputeStatus[]
): Promise<DisputeCase[]> {
  const c = await tryDb();
  if (!c) return mockListDisputesByStatus(...statuses);
  const { data, error } = await c
    .from("disputes")
    .select("*")
    .in("status", statuses)
    .is("deleted_at", null)
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => caseFrom(r, []));
}

export async function getDispute(caseId: Hex): Promise<DisputeCase | null> {
  const c = await tryDb();
  if (!c) return mockGetDispute(caseId);
  const { data, error } = await c
    .from("disputes")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Row;
  return caseFrom(row, await hydrate(c, String(row.id)));
}

export async function getByContext(
  context: DisputeContext,
  contextRefId: Hex,
): Promise<DisputeCase | null> {
  const c = await tryDb();
  if (!c) return mockGetDisputeByContext(context, contextRefId);
  const { data, error } = await c
    .from("disputes")
    .select("*")
    .eq("source", context)
    .eq("source_id", contextRefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Row;
  return caseFrom(row, await hydrate(c, String(row.id)));
}

export interface OpenDisputeInput {
  caseId: Hex;
  context: DisputeContext;
  contextRefId: Hex;
  vendorId: string;
  claimantLabel: string;
  respondentLabel: string;
  amountUsdc: bigint;
  openingNote: string;
  openingHash: Hex;
  /** cashout → 'lp' + the LP's uuid; agent/stream/invoice → 'system'. The
   *  uuid-cast RLS branches only fire for vendor/lp, so a real uuid is
   *  required when kind is 'lp' (audit #118 cast trap). */
  respondentKind?: "lp" | "system";
  respondentId?: string;
}

export async function openDispute(
  input: OpenDisputeInput,
): Promise<DisputeCase> {
  const c = await tryDb();
  if (!c) return mockOpenDispute(input);
  const payload = {
    case_id: input.caseId,
    source: input.context,
    source_id: input.contextRefId,
    claimant_kind: "vendor",
    claimant_id: input.vendorId,
    respondent_kind: input.respondentKind ?? "system",
    respondent_id: input.respondentId ?? "system",
    amount_usdc: input.amountUsdc.toString(),
    opening_evidence_hash: input.openingHash,
    status: "OPENED",
    claimant_label: input.claimantLabel,
    respondent_label: input.respondentLabel,
    opening_note: input.openingNote,
  } as unknown as TablesInsert<"disputes">;
  const { data, error } = await c
    .from("disputes")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  const row = data as Row;
  await c.from("dispute_evidence").insert({
    dispute_id: String(row.id),
    submitter_kind: "vendor",
    submitter_id: input.vendorId,
    body_md: input.openingNote,
    attachment_hash: input.openingHash,
  } as unknown as TablesInsert<"dispute_evidence">);
  return caseFrom(row, [
    { by: "claimant", at: new Date(), note: input.openingNote, hash: input.openingHash },
  ]);
}

export async function addEvidence(
  caseId: Hex,
  item: DisputeEvidenceItem,
): Promise<DisputeCase | null> {
  const c = await tryDb();
  if (!c) return mockAddEvidence(caseId, item);
  const found = await c
    .from("disputes")
    .select("id")
    .eq("case_id", caseId)
    .maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return null;
  const id = String((found.data as Row).id);
  const submitterKind =
    item.by === "operator" ? "admin" : item.by === "respondent" ? "lp" : "vendor";
  await c.from("dispute_evidence").insert({
    dispute_id: id,
    submitter_kind: submitterKind,
    submitter_id: "self",
    body_md: item.note,
    attachment_hash: item.hash,
  } as unknown as TablesInsert<"dispute_evidence">);
  const nextStatus =
    item.by === "operator" ? "EVIDENCE_REQUESTED" : "EVIDENCE_SUBMITTED";
  await c.from("disputes").update({ status: nextStatus }).eq("case_id", caseId);
  return getDispute(caseId);
}

export async function assignToReview(
  caseId: Hex,
): Promise<DisputeCase | null> {
  const c = await tryDb();
  if (!c) return mockAssignDisputeToReview(caseId);
  await c.from("disputes").update({ status: "UNDER_REVIEW" }).eq("case_id", caseId);
  return getDispute(caseId);
}

export async function decide(
  caseId: Hex,
  outcome: DisputeOutcome,
  decisionNote: string,
  reasonHash: Hex,
): Promise<DisputeCase | null> {
  const c = await tryDb();
  if (!c) return mockDecideDispute(caseId, outcome, decisionNote, reasonHash);
  // idempotent: only flip a non-DECIDED case (mirror on-chain replay revert).
  const { data, error } = await c
    .from("disputes")
    .update({
      status: "DECIDED",
      outcome,
      decision_reason_hash: reasonHash,
      decided_at: new Date().toISOString(),
    } as unknown as TablesUpdate<"disputes">)
    .eq("case_id", caseId)
    .neq("status", "DECIDED")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const existing = await getDispute(caseId);
    if (existing?.status === "DECIDED")
      throw new Error(`dispute ${caseId} already DECIDED; cannot re-decide`);
    return existing;
  }
  return getDispute(caseId);
}
