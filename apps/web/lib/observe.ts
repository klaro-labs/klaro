/**
 * Server-action observability wrapper.
 * Pattern:
 * export const myAction = observe("invoice.create", async (data) => { … });
 * Captures:
 * - Sentry breadcrumb + error on throw (via captureError).
 * - Audit log entry on success (when `subject` is provided).
 * - Analytics track on success (server-side counter).
 * Keep the wrapper thin so server actions stay easy to read. Hand-wired
 * auditRecord calls remain legal where the entry needs reason codes or
 * fine-grained subject ids the wrapper can't infer.
 */
import { captureError } from "./sentry";
import {
  record as auditRecord,
  type AuditActionCode,
  type AuditEntry,
} from "./auditLog";

export interface ObserveCtx {
  /** Free-form action name for breadcrumb + analytics — does NOT need to be an AuditActionCode. */
  name: string;
  /** Optional audit subject. When set, success path appends an auditRecord entry. */
  subject?: {
    kind: AuditEntry["subjectKind"];
    id: string;
    actor: string;
    actionCode: AuditActionCode;
    reasonHash?: string;
    runbookId?: string;
  };
}

export function observe<A extends unknown[], R>(
  ctx: ObserveCtx | string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const c: ObserveCtx = typeof ctx === "string" ? { name: ctx } : ctx;
  return async (...args: A): Promise<R> => {
    try {
      const result = await fn(...args);
      if (c.subject) {
        try {
          auditRecord({
            actor: c.subject.actor,
            action: c.subject.actionCode,
            subjectKind: c.subject.kind,
            subjectId: c.subject.id,
            reasonHash: c.subject.reasonHash,
            runbookId: c.subject.runbookId,
          });
        } catch (e) {
          captureError(e, { where: "observe.audit", action: c.name });
        }
      }
      return result;
    } catch (e) {
      captureError(e, { action: c.name });
      throw e;
    }
  };
}
