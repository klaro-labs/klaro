import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { listSessionKeys } from "@/lib/repo/delegations";
import { relativeTime, shortAddress } from "@/lib/money";
import { supabaseLive } from "@/lib/env";
import { createSessionKeyAction } from "./actions";
import { RevokeSessionKeyButton } from "./RevokeSessionKeyButton";

const SCOPES: Array<{ value: string; label: string; desc: string }> = [
  {
    value: "INVOICES_CREATE",
    label: "Invoices · create",
    desc: "Create + send invoices · cannot settle, cashout, or change account",
  },
  {
    value: "INVOICES_SETTLE",
    label: "Invoices · full",
    desc: "Create + settle invoices · cannot cashout or change account",
  },
  {
    value: "CASHOUT_REQUEST",
    label: "Cashout · request",
    desc: "Open cashout requests · cannot confirm receipt or dispute",
  },
  {
    value: "READ_ONLY",
    label: "Read only",
    desc: "Dashboard view · no writes",
  },
];

export default async function DelegationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const keys = await listSessionKeys(session.vendor.id);
  // The delegation RECORD persists (supabaseLive). The Circle Modular Wallet /
  // ERC-6900 session-key issuance + enforcement is NOT implemented yet — having
  // a CIRCLE_CLIENT_KEY present does not make it real — so it's always pending.
  const persisted = supabaseLive();

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Session keys
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Delegations
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Issue a scoped, expiring session key to a delegate address (e.g.
              your accountant&apos;s wallet or an automation bot). The
              delegation is recorded in Klaro; the Circle Modular Wallets
              (ERC-6900) on-chain enforcement that actually gates the
              delegate&apos;s authority is partner-pending.
            </p>
          </div>
          <Badge tone={persisted ? "info" : "sim"}>
            {persisted
              ? "Recorded · Circle enforcement pending"
              : "Simulated session"}
          </Badge>
        </div>

        <div className="mb-4 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Scope enforcement (partner-pending)
          </p>
          <p className="mt-1">
            Each key stores a scope + expiry. Once Circle Modular Wallets is
            wired, the ERC-6900 module gates on-chain calls — a{" "}
            <code className="font-mono">CASHOUT_REQUEST</code> key could not
            trigger <code className="font-mono">InvoiceEscrow.settle()</code>{" "}
            even if the server were compromised. Until then a key is a recorded
            intent, <strong>not yet an enforced grant</strong>.
          </p>
        </div>

        <form
          action={createSessionKeyAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Label</span>
            <input
              name="label"
              required
              placeholder="Accounting bot · Stripe payouts"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Delegate address (Arc)
            </span>
            <input
              name="delegate"
              required
              placeholder="0x…"
              pattern="^0x[0-9a-fA-F]{40}$"
              className="rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Scope</span>
            <select
              name="scope"
              defaultValue="INVOICES_CREATE"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Expires in (hours · max 720 = 30 days)
            </span>
            <input
              name="ttlHours"
              type="number"
              min="1"
              max="720"
              defaultValue="24"
              required
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Issue session key
            </button>
          </div>
        </form>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Active session keys
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No active session keys. Issue one above to delegate scoped, expiring
            authority.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {keys.map((k) => {
              const expired = k.expiresAt < new Date();
              return (
                <li
                  key={k.id}
                  className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_auto_auto_auto_auto] md:items-center"
                >
                  <div>
                    <div className="font-medium">{k.label}</div>
                    <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                      {shortAddress(k.delegateAddress)}
                    </div>
                  </div>
                  <Badge tone="info">
                    {k.scope.replace("_", " ").toLowerCase()}
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    {expired
                      ? "expired"
                      : `expires ${relativeTime(k.expiresAt)}`}
                  </span>
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    created {relativeTime(k.createdAt)}
                  </span>
                  <RevokeSessionKeyButton id={k.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
