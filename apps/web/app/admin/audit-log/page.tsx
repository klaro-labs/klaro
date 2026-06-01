import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { recent } from "@/lib/auditLog";
import { listRecentAudit } from "@/lib/repo/auditLogs";
import { relativeTime } from "@/lib/money";

export const metadata = { title: "Audit log · Klaro admin" };

const KIND_TONE: Record<string, "info" | "sim" | "live"> = {
  vendor: "info",
  lp: "info",
  agent: "info",
  cashout: "info",
  invoice: "info",
  corridor: "sim",
  contract: "sim",
  dispute: "live",
};

type Row = {
  id: string;
  subjectKind: string;
  action: string;
  subjectId: string;
  reasonHash?: string;
  at: Date;
};

// I3: read the DURABLE audit_logs table (RLS-scoped to admins). The in-memory
// ring is a per-process dev fallback only — it loses history on restart and was
// never the real trail. Falls back to the ring when there's no live DB (dev).
export default async function AdminAuditLogPage() {
  const persisted = await listRecentAudit(200).catch(() => []);
  const live = persisted.length > 0;
  const entries: Row[] = live
    ? persisted.map((r) => ({
        id: r.id,
        subjectKind: r.subject_kind,
        action: r.action,
        subjectId: r.subject_id,
        reasonHash: r.reason_hash ?? undefined,
        at: new Date(r.at),
      }))
    : recent(200).map((e) => ({
        id: e.id,
        subjectKind: e.subjectKind,
        action: e.action,
        subjectId: e.subjectId,
        reasonHash: e.reasonHash,
        at: e.at,
      }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Operator audit ·{" "}
              {live
                ? "durable audit_logs (append-only, last 200)"
                : "in-memory ring (dev fallback, last 200)"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Audit log
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Every operator action lands here with action code, subject, reason
              hash, and a markdown note. Live mode mirrors to{" "}
              <code className="font-mono">audit_logs</code> in Supabase + Sentry
              breadcrumb. PII is redacted from breadcrumbs.
            </p>
          </div>
          <Badge tone="info">{entries.length}</Badge>
        </header>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            Nothing recorded yet this session. Audit entries appear as operator
            actions fire.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {entries.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[auto_auto_1fr_auto_auto] md:items-center"
              >
                <Badge tone={KIND_TONE[e.subjectKind] ?? "info"}>
                  {e.subjectKind}
                </Badge>
                <code className="font-mono text-xs font-medium text-[var(--color-brand)]">
                  {e.action}
                </code>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  {e.subjectId}
                </span>
                {e.reasonHash ? (
                  <code className="font-mono text-[10px] text-[var(--color-ink-subtle)]">
                    {e.reasonHash.slice(0, 10)}…
                  </code>
                ) : (
                  <span />
                )}
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
