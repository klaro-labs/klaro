import { Badge } from "@/components/ui/Badge";
import { latestSnapshotsByWindow } from "@/lib/repo/kpiSnapshots";
import { relativeTime } from "@/lib/money";

export const metadata = {
  title: "KPI · Klaro internal",
  robots: { index: false },
};

const CORRIDORS_STATIC = [
  {
    corridor: "USDC → INR",
    volume7d: "—",
    spread: "32 bps",
    lps: 8,
    status: "live" as const,
  },
  {
    corridor: "USDC → BRL",
    volume7d: "—",
    spread: "47 bps",
    lps: 5,
    status: "partner-pending" as const,
  },
  {
    corridor: "USDC → PHP",
    volume7d: "—",
    spread: "29 bps",
    lps: 4,
    status: "partner-pending" as const,
  },
  {
    corridor: "USDC → MXN",
    volume7d: "—",
    spread: "38 bps",
    lps: 3,
    status: "partner-pending" as const,
  },
  {
    corridor: "USDC → EURC",
    volume7d: "—",
    spread: "8 bps",
    lps: 2,
    status: "live" as const,
  },
];

const SLO = [
  { name: "Settlement p95", target: "< 5s", actual: "—", ok: true },
  { name: "Webhook delivery p95", target: "< 30s", actual: "—", ok: true },
  { name: "Dispute resolution", target: "< 24h", actual: "—", ok: true },
  { name: "API availability", target: "≥ 99.9%", actual: "—", ok: true },
  { name: "RPC fallback rate", target: "< 0.5%", actual: "—", ok: true },
];

export default async function InternalKpiPage() {
  const snapshots = await latestSnapshotsByWindow();
  const anySimulated = snapshots.some((s) => s.simulated);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Internal · powered by daemon&apos;s KPIAggregator
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              KPI
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Hourly + daily + 7-day rollups written by the daemon. Corridor +
              SLO panels read from the static spec until Prometheus is wired.
            </p>
          </div>
          <Badge tone={anySimulated ? "sim" : "live"}>
            {anySimulated ? "partial" : "live"}
          </Badge>
        </header>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Volume rollups
        </h2>
        <div className="mb-10 grid gap-3 md:grid-cols-3">
          {snapshots.map((s) => (
            <div
              key={s.windowLabel}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                  {s.windowLabel}
                </span>
                <Badge tone={s.simulated ? "sim" : "live"}>
                  {s.simulated ? "no data" : "live"}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Invoices" value={s.invoices} />
                <Stat label="Settled" value={s.settled} />
                <Stat label="Cashouts" value={s.cashouts} />
              </dl>
              <p className="mt-3 text-[11px] text-[var(--color-ink-subtle)]">
                Snapshot {relativeTime(s.takenAt)}
              </p>
            </div>
          ))}
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Corridors</h2>
        <ul className="mb-10 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {CORRIDORS_STATIC.map((c) => (
            <li
              key={c.corridor}
              className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center"
            >
              <span className="font-medium">{c.corridor}</span>
              <span className="text-sm">{c.volume7d}</span>
              <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                {c.spread}
              </span>
              <span className="text-xs text-[var(--color-ink-subtle)]">
                {c.lps} LPs
              </span>
              <Badge tone={c.status === "live" ? "live" : "sim"}>
                {c.status}
              </Badge>
            </li>
          ))}
        </ul>

        <h2 className="mb-3 font-display text-xl font-semibold">SLOs</h2>
        <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {SLO.map((s) => (
            <li
              key={s.name}
              className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[1.4fr_auto_auto_auto] md:items-center"
            >
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                target {s.target}
              </span>
              <span className="text-sm">{s.actual}</span>
              <Badge tone={s.ok ? "live" : "sim"}>
                {s.ok ? "—" : "breach"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold">
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
    </div>
  );
}
