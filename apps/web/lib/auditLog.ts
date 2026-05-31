/**
 * Admin audit log. v2 §29.3. Mandatory.
 * Every operator action that mutates user-visible state lands here. Reads:
 * - Sentry breadcrumb (for incident correlation)
 * - ClickHouse table (long-term retention; live wire = M12)
 * - In-memory ring buffer (mock + dev visibility)
 * Schema mirrors the 8-section runbook field-set so an operator never
 * authors free-form logs — they pick from canonical action codes + attach
 * a ReasonCodes hash + a markdown note.
 */

import { captureError } from "./sentry";
import { appendAudit } from "./repo/auditLogs";

export type AuditActionCode =
  | "dispute.request_evidence"
  | "dispute.assign_review"
  | "dispute.decide"
  | "lp.admit"
  | "lp.suspend"
  | "lp.revoke"
  | "lp.slash"
  | "cashout.expire"
  | "cashout.resolve"
  | "agent.deactivate"
  | "agent.reactivate"
  // F-2 (web audit): createJob + advanceJob previously cast to
  // "agent.reactivate" because no specific codes existed — audit log
  // recorded every job creation + state transition as a reactivation,
  // breaking SAR/regulator queries against the audit table (principle
  // 12: proof beats claims).
  | "agent.create_job"
  | "agent.advance_job"
  | "refund.countersign"
  | "refund.refuse"
  | "corridor.pause"
  | "corridor.resume"
  | "contract.pause"
  | "contract.unpause"
  | "contract.upgrade"
  | "kyb.revoke"
  | "kyb.reinstate"
  | "vendor.lockout"
  | "vendor.unlockout"
  | "fx.quote.create"
  | "fx.quote.settle"
  // Audit 2026-05-31 (D5 P4): LP onboarding + retainer actions all logged
  // "lp.admit" regardless of operation, breaking audit-trail queries. Same
  // class as the F-2 agent.* fix above. Distinct codes per operation:
  | "lp.invite"
  | "lp.apply"
  | "lp.submit_docs"
  | "lp.rotate_wallet"
  | "lp.toggle_notification"
  | "lp.toggle_corridor"
  | "retainer.create"
  | "retainer.withdraw"
  | "retainer.cancel"
  | "lp.dispute.defend";

export interface AuditEntry {
  id: string;
  at: Date;
  actor: string; // operator id / wallet
  action: AuditActionCode;
  subjectKind:
    | "vendor"
    | "lp"
    | "agent"
    | "cashout"
    | "invoice"
    | "corridor"
    | "contract"
    | "dispute";
  subjectId: string; // e.g. cashoutId, lpId
  reasonHash?: string; // ReasonCodes.* keccak hex
  evidenceHash?: string;
  noteMd?: string;
  runbookId?: string; // e.g. "cashout-stuck"
}

const _ring: AuditEntry[] = [];
const MAX = 1000;

export function record(
  entry: Omit<AuditEntry, "id" | "at"> & { at?: Date },
): AuditEntry {
  const full: AuditEntry = {
    id: `aud_${Math.random().toString(36).slice(2, 10)}`,
    at: entry.at ?? new Date(),
    ...entry,
  };
  _ring.push(full);
  if (_ring.length > MAX) _ring.splice(0, _ring.length - MAX);

  // Mirror to Sentry as breadcrumb so incident traces include operator context.
  // P1 (#94): redact PII before it leaves the box —
  // free-form `noteMd` could contain emails, names, payout details that the
  // operator typed when annotating. The ID + reason hash give enough context
  // for triage without leaking to a third-party observability vendor.
  captureError(new Error(`audit:${entry.action}`), {
    id: full.id,
    at: full.at.toISOString(),
    actor: redactPotentialPII(entry.actor),
    action: entry.action,
    subjectKind: entry.subjectKind,
    subjectId: entry.subjectId,
    reasonHash: entry.reasonHash,
    evidenceHash: entry.evidenceHash,
    runbookId: entry.runbookId,
    severity: "info",
    // noteMd intentionally dropped.
  });

  // Live mode: persist to Supabase audit_logs via service-role repo (RLS-bypass
  // because the caller's role was already proven by requireOperator/requireVendor).
  // Fire-and-forget; failures get captured by Sentry through the catch wrapper.
  appendAudit({
    actorKind: "admin", // refined by caller in future; safe default since most callers are operator-gated
    actorId: entry.actor,
    action: entry.action,
    subjectKind: entry.subjectKind,
    subjectId: entry.subjectId,
    reasonHash: entry.reasonHash ?? null,
    evidenceHash: entry.evidenceHash ?? null,
    noteMd: entry.noteMd ?? null,
    runbookId: entry.runbookId ?? null,
    at: full.at,
  }).catch((e) =>
    captureError(e, { where: "appendAudit", actionCode: entry.action }),
  );

  return full;
}

export function recent(limit = 50): AuditEntry[] {
  return _ring.slice(-limit).reverse();
}

export function filterBySubject(
  kind: AuditEntry["subjectKind"],
  id: string,
): AuditEntry[] {
  return _ring
    .filter((e) => e.subjectKind === kind && e.subjectId === id)
    .reverse();
}

/** Best-effort PII scrub for `actor`/free-form strings before they ship to Sentry.
 * Catches the obvious cases — email + 0x-wallet — and keeps shape for triage. */
function redactPotentialPII(s: string | undefined): string | undefined {
  if (!s) return s;
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/0x[a-f0-9]{40}/gi, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}
