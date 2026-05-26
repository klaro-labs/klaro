import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { recent } from "@/lib/auditLog";
import { relativeTime } from "@/lib/money";

export const metadata = { title: "Audit log · Klaro admin" };

const KIND_TONE = {
  vendor: "info",
  lp: "info",
  agent: "info",
  cashout: "info",
  invoice: "info",
  corridor: "sim",
  contract: "sim",
  dispute: "live",
} as const;

export default function AdminAuditLogPage() {
  const entries = recent(200);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Operator audit · in-memory ring buffer (last 200)
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
                <Badge tone={KIND_TONE[e.subjectKind]}>{e.subjectKind}</Badge>
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
