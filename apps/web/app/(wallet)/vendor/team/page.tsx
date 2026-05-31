import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { listTeam } from "@/lib/repo/team";
import { relativeTime } from "@/lib/money";
import { supabaseLive } from "@/lib/env";
import {
  inviteTeammateAction,
  changeRoleAction,
  removeTeammateAction,
} from "./actions";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  Owner: "Full control · billing · destroy team",
  Admin: "All operations · cannot change billing or remove owner",
  Member:
    "Create invoices · view cashout · cannot open cashouts or modify webhooks",
  ReadOnly: "Dashboard view only · no writes",
};

const ROLE_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  Owner: "live",
  Admin: "info",
  Member: "neutral",
  ReadOnly: "neutral",
};

export default async function TeamPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const team = await listTeam(session.vendor.id);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Team &amp; roles
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Team
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            Four roles. Backed by Supabase RLS in live mode, in-memory mock
            otherwise. Each role&apos;s scope is enforced server-side at the
            API layer + Postgres row-level — clients cannot bypass.
          </p>
        </div>
        <Badge tone={supabaseLive() ? "live" : "sim"}>
          {supabaseLive()
            ? "Supabase RLS"
            : "Simulated · SUPABASE_URL not set"}
        </Badge>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-4">
        {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
          <div
            key={role}
            className="rounded-lg border border-[var(--color-line)] bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{role}</span>
              <Badge tone={ROLE_TONE[role]}>role</Badge>
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{desc}</p>
          </div>
        ))}
      </div>

      <form
        action={inviteTeammateAction}
        className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[1fr_auto_auto] md:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">Email address</span>
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
            className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">Role</span>
          <select
            name="role"
            defaultValue="Member"
            className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
          >
            <option>Admin</option>
            <option>Member</option>
            <option>ReadOnly</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          Invite
        </button>
      </form>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Members</h2>
      {team.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
          <p className="font-display text-lg font-semibold tracking-tight">
            Just you, for now
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-ink-muted)]">
            Invite a teammate above. They&apos;ll get an email link to claim
            their role.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {team.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_auto_auto_auto] md:items-center"
            >
              <div>
                <div className="font-medium">{m.email}</div>
                <div className="text-xs text-[var(--color-ink-subtle)]">
                  {m.status === "INVITED"
                    ? `Invited ${relativeTime(m.invitedAt)} · awaiting accept`
                    : `Active since ${relativeTime(m.acceptedAt ?? m.invitedAt)}`}
                </div>
              </div>
              <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
              <span className="text-xs text-[var(--color-ink-subtle)]">
                {m.status}
              </span>
              {m.role === "Owner" ? (
                <span className="rounded border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-ink-subtle)]">
                  Owner
                </span>
              ) : (
                <details className="relative">
                  <summary className="cursor-pointer rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--color-brand)]">
                    Manage
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-56 space-y-2 rounded-lg border border-[var(--color-line)] bg-white p-3 shadow-md">
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        await changeRoleAction(
                          m.id,
                          String(formData.get("role") ?? "") as
                            | "Admin"
                            | "Member"
                            | "ReadOnly",
                        );
                      }}
                      className="space-y-1.5"
                    >
                      <label className="block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                        Change role
                      </label>
                      <div className="flex gap-2">
                        <select
                          name="role"
                          defaultValue={m.role}
                          className="flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
                        >
                          <option>Admin</option>
                          <option>Member</option>
                          <option>ReadOnly</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded bg-[var(--color-ink)] px-2 py-1 text-xs font-medium text-white hover:bg-black"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await removeTeammateAction(m.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="w-full rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100"
                      >
                        Remove from team
                      </button>
                    </form>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
