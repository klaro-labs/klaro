/**
 * Audit log repository — server-side append-only, no RLS-bypassing user access.
 * Writes go through `serviceDb()` because the actor's role is already proved
 * by the calling server-action (requireOperator / requireVendor). In dev with
 * no Supabase, writes flow to console + the in-memory ring buffer in auditLog.ts.
 */
import { tryDb } from "../db";
import type { ActorKind, DbAuditLog } from "../dbTypes";

export interface AuditWriteInput {
  actorKind: ActorKind;
  actorId: string;
  action: string;
  subjectKind: string;
  subjectId: string;
  reasonHash?: string | null;
  evidenceHash?: string | null;
  noteMd?: string | null;
  runbookId?: string | null;
  ipHash?: string | null;
  uaHash?: string | null;
  at?: Date;
}

export async function appendAudit(input: AuditWriteInput): Promise<void> {
  const c = await tryDb();
  if (!c) {
    // Dev fallback: rely on auditLog.ts ring buffer + console (already wired there).
    return;
  }
  const { error } = await c.from("audit_logs").insert({
    actor_kind: input.actorKind,
    actor_id: input.actorId,
    action: input.action,
    subject_kind: input.subjectKind,
    subject_id: input.subjectId,
    reason_hash: input.reasonHash ?? null,
    evidence_hash: input.evidenceHash ?? null,
    note_md: input.noteMd ?? null,
    runbook_id: input.runbookId ?? null,
    ip_hash: input.ipHash ?? null,
    ua_hash: input.uaHash ?? null,
    at: (input.at ?? new Date()).toISOString(),
  });
  if (error) throw error;
}

export async function listForSubject(
  subjectKind: string,
  subjectId: string,
  limit = 50,
): Promise<DbAuditLog[]> {
  const c = await tryDb();
  if (!c) return [];
  const { data, error } = await c
    .from("audit_logs")
    .select("*")
    .eq("subject_kind", subjectKind)
    .eq("subject_id", subjectId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DbAuditLog[];
}
