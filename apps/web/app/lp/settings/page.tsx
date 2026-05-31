import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { requireLp } from "@/lib/auth";
import { shortAddress } from "@/lib/money";
import { rotateWalletAction, beginExitAction } from "./actions";

export const metadata = { title: "Settings · Klaro LP" };

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
          {/* Iter 73 honesty: same lp_preferences gap as Notifications below.
              Corridor enable/disable previewed; persistence ships M11. */}
          <p className="border-b border-[var(--color-line)] bg-amber-50 px-6 py-3 text-xs text-amber-900">
            Corridor enable/disable ships soon. The list below shows the
            corridors Klaro currently allow-lists for LPs at large.
          </p>
          <ul className="divide-y divide-[var(--color-line)]">
            {CORRIDORS.map((c) => (
              <li
                key={c.code}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-6 py-3"
              >
                <span className="text-sm">{c.label}</span>
                <Badge tone="sim">no data</Badge>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                  Coming soon
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Notifications">
          {/*
            Per-LP notification preferences need an `lp_preferences` table.
            Until that migration ships, the toggles render disabled with a
            "Coming soon" badge so the LP doesn't believe a click persists.
          */}
          <p className="border-b border-[var(--color-line)] bg-amber-50 px-6 py-3 text-xs text-amber-900">
            Notification preferences are coming soon — the toggles below preview
            the defaults Klaro will fire. Email
            <a
              className="ml-1 underline hover:text-amber-700"
              href="mailto:lp@klaro.so?subject=LP%20notification%20preferences"
            >
              lp@klaro.so
            </a>{" "}
            for ad-hoc opt-outs before then.
          </p>
          {NOTIFICATIONS.map((n) => (
            <div
              key={n.key}
              className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-3 last:border-b-0"
            >
              <span className="text-sm">{n.label}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-3 py-1 text-xs ${n.defaultOn ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] text-[var(--color-brand)]" : "border-[var(--color-line)] text-[var(--color-ink-muted)]"}`}
                >
                  {n.defaultOn ? "On (default)" : "Off (default)"}
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                  Coming soon
                </span>
              </div>
            </div>
          ))}
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
