import { LPNav } from "@/components/klaro/LPNav";
import { requireLp } from "@/lib/auth";
import { shortAddress } from "@/lib/money";
import {
  rotateWalletAction,
  beginExitAction,
  toggleNotificationAction,
  toggleCorridorAction,
} from "./actions";

export const metadata = { title: "Settings · Klaro LP" };

/**
 * #14: load the LP's persisted preference rows (lp_preferences, vendor-scoped
 * RLS). Returns a flat { pref_key: bool } map so the toggles render their real
 * current state. Best-effort: mock/dev returns {} and the toggles fall back to
 * their declared defaults.
 */
async function loadPrefs(): Promise<Record<string, boolean>> {
  const { tryDb } = await import("@/lib/db");
  const c = await tryDb();
  if (!c) return {};
  const db = c as unknown as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: { pref_key: string; pref_value: boolean }[] | null;
      }>;
    };
  };
  const { data } = await db.from("lp_preferences").select("pref_key,pref_value");
  const map: Record<string, boolean> = {};
  for (const row of data ?? []) map[row.pref_key] = row.pref_value;
  return map;
}

const CORRIDORS = [
  { code: "INR", label: "India · INR via UPI" },
  { code: "BRL", label: "Brazil · BRL via PIX" },
  { code: "PHP", label: "Philippines · PHP" },
  { code: "MXN", label: "Mexico · MXN via SPEI" },
];

const NOTIFICATIONS = [
  { key: "claim", label: "Email on new claimable order", defaultOn: true },
  { key: "dispute", label: "Email on dispute opened", defaultOn: true },
  { key: "stake", label: "Email on stake threshold drop", defaultOn: true },
  { key: "slack", label: "Slack webhook (Tier 2+ only)", defaultOn: false },
];

export default async function LPSettingsPage() {
  const { lp } = await requireLp();
  const entityName = lp.legalEntityName ?? lp.contactEmail;
  const prefs = await loadPrefs();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Settings
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Account & preferences
          </h1>
        </header>

        <Section title="Entity">
          <Field label="Legal name" value={lp.legalEntityName ?? "—"} />
          <Field label="Country" value={lp.country ?? "—"} />
          <Field label="Contact" value={lp.contactEmail} />
        </Section>

        <Section title="Payout wallet">
          <Field
            label="Current"
            value={lp.wallet ? shortAddress(lp.wallet) : "—"}
            mono
          />
          <form
            action={rotateWalletAction}
            className="border-t border-[var(--color-line)] px-6 py-4"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--color-ink-muted)]">
                Rotate to a new wallet
              </span>
              <div className="flex gap-3">
                <input
                  name="nextWallet"
                  required
                  placeholder="0x…"
                  className="flex-1 rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
                />
                <button
                  type="submit"
                  className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
                >
                  Rotate
                </button>
              </div>
              <span className="text-[11px] text-[var(--color-ink-subtle)]">
                Recorded immediately as your payout wallet. (Production adds a
                48h cooldown + a confirmation ping to the existing wallet.)
              </span>
            </label>
          </form>
        </Section>

        <Section title="Active corridors">
          <p className="border-b border-[var(--color-line)] px-6 py-3 text-xs text-[var(--color-ink-muted)]">
            Enable the corridors you want to be matched against. Saved to your
            LP profile immediately.
          </p>
          <ul className="divide-y divide-[var(--color-line)]">
            {CORRIDORS.map((c) => {
              const on = prefs[`corridor.${c.code}`] ?? false;
              return (
                <li
                  key={c.code}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <span className="text-sm">{c.label}</span>
                  <form action={toggleCorridorAction}>
                    <input type="hidden" name="corridor" value={c.code} />
                    <input type="hidden" name="enable" value={on ? "0" : "1"} />
                    <Toggle on={on} />
                  </form>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Notifications">
          <p className="border-b border-[var(--color-line)] px-6 py-3 text-xs text-[var(--color-ink-muted)]">
            Choose which emails Klaro sends you. Changes save immediately.
          </p>
          {NOTIFICATIONS.map((n) => {
            const on = prefs[`notification.${n.key}`] ?? n.defaultOn;
            return (
              <div
                key={n.key}
                className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-3 last:border-b-0"
              >
                <span className="text-sm">{n.label}</span>
                <form action={toggleNotificationAction}>
                  <input type="hidden" name="key" value={n.key} />
                  <input type="hidden" name="value" value={on ? "0" : "1"} />
                  <Toggle on={on} />
                </form>
              </div>
            );
          })}
        </Section>

        <Section title="Danger zone">
          <p className="px-6 py-3 text-xs text-[var(--color-ink-muted)]">
            Voluntarily exit the LP program. Unwind active orders, withdraw
            stake after 7d cooldown, archive your account. Operator-gated for
            safety.
          </p>
          <div className="border-t border-[var(--color-line)] px-6 py-4">
            <form action={beginExitAction}>
              <button
                type="submit"
                className="rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100"
              >
                Begin LP exit flow
              </button>
            </form>
          </div>
        </Section>
      </section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      <div className="rounded-lg border border-[var(--color-line)] bg-white">
        {children}
      </div>
    </section>
  );
}

/**
 * A submit button styled as an on/off pill. The enclosing <form> carries the
 * hidden inputs + server action; clicking flips the persisted value. Rendered
 * as a real submit (not JS state) so it works without client hydration.
 */
function Toggle({ on }: { on: boolean }) {
  return (
    <button
      type="submit"
      aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] text-[var(--color-brand)] hover:bg-[var(--color-brand)]/15"
          : "border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-bg)]"
      }`}
    >
      {on ? "On" : "Off"}
    </button>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-[var(--color-line)] px-6 py-3 last:border-b-0">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
