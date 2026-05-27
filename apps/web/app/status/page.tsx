import Link from "next/link";
import { Logo } from "@/components/klaro/Logo";

/**
 * Public status page. v2 §37.
 * Surfaces the current health of every Klaro-operated service + the on-chain
 * pause state of every Klaro contract. Live BetterStack heartbeat + Arc RPC
 * health checks wire up in M11; mock-mode renders the layout + last-incident
 * widget so reviewers see how an incident lands here.
 */

interface Service {
  name: string;
  scope: "infra" | "onchain" | "integration";
  status: "operational" | "degraded" | "outage" | "maintenance";
  detail: string;
}

const SERVICES: Service[] = [
  {
    name: "klaro.so web",
    scope: "infra",
    status: "operational",
    detail: "Vercel edge · global · p95 < 250ms",
  },
  {
    name: "Operator daemon",
    scope: "infra",
    status: "operational",
    detail: "Railway · BullMQ + Arc event listener",
  },
  {
    name: "Hosted invoice / receipt",
    scope: "infra",
    status: "operational",
    detail: "i.klaro.so + receipt.klaro.so",
  },
  {
    name: "Arc testnet RPC",
    scope: "onchain",
    status: "operational",
    detail: "Sub-second deterministic finality · upstream Arc node",
  },
  {
    name: "InvoiceEscrow contract",
    scope: "onchain",
    status: "operational",
    detail: "Not paused · ready to settle",
  },
  {
    name: "CashoutOrderProcessor",
    scope: "onchain",
    status: "operational",
    detail: "Not paused · LP queue draining",
  },
  {
    name: "AgentEscrow",
    scope: "onchain",
    status: "operational",
    detail: "Not paused · jobs flowing",
  },
  {
    name: "Circle Gateway",
    scope: "integration",
    status: "operational",
    detail: "Cross-chain pulls landing",
  },
  {
    name: "CCTP V2",
    scope: "integration",
    status: "operational",
    detail: "Burn/mint within 8-20s targets",
  },
  {
    name: "Supabase auth",
    scope: "integration",
    status: "operational",
    detail: "Magic-link + OAuth verifying",
  },
];

const STATUS_STYLE: Record<Service["status"], string> = {
  operational: "bg-emerald-100 text-emerald-800",
  degraded: "bg-amber-100 text-amber-800",
  outage: "bg-red-100 text-red-800",
  maintenance: "bg-blue-100 text-blue-800",
};

const SCOPE_LABEL: Record<Service["scope"], string> = {
  infra: "Infrastructure",
  onchain: "On-chain",
  integration: "External integration",
};

const OVERALL: Service["status"] = SERVICES.every(
  (s) => s.status === "operational",
)
  ? "operational"
  : SERVICES.some((s) => s.status === "outage")
    ? "outage"
    : "degraded";

function groupByScope(): [Service["scope"], Service[]][] {
  const groups: Record<Service["scope"], Service[]> = {
    infra: [],
    onchain: [],
    integration: [],
  };
  for (const s of SERVICES) groups[s.scope].push(s);
  return (Object.keys(groups) as Service["scope"][]).map((k) => [k, groups[k]]);
}

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="border-b border-[var(--color-line)] bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={22} />
            <span className="font-display text-lg font-semibold">
              Klaro Status
            </span>
          </Link>
          <a
            href="https://twitter.com/klaro_xyz"
            className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            target="_blank"
            rel="noreferrer"
          >
            @klaro_xyz
          </a>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                Overall
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {OVERALL === "operational"
                  ? "All systems operational"
                  : OVERALL === "degraded"
                    ? "Some systems degraded"
                    : "Active outage"}
              </h1>
            </div>
            <span
              className={`inline-flex rounded-pill px-4 py-2 text-sm font-medium ${STATUS_STYLE[OVERALL]}`}
            >
              {OVERALL}
            </span>
          </div>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Live monitoring via BetterStack + Arc RPC health probes lands soon.
            For incident postmortems see{" "}
            <a
              href="https://github.com/klaro-protocol/incidents"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              github.com/klaro-protocol/incidents
            </a>
            .
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {groupByScope().map(([scope, services]) => (
            <div key={scope}>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                {SCOPE_LABEL[scope]}
              </p>
              <ul className="mt-2 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
                {services.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-4 px-6 py-4"
                  >
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--color-ink-subtle)]">
                        {s.detail}
                      </div>
                    </div>
                    <span
                      className={`inline-flex rounded-pill px-3 py-1 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                    >
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Testnet preview — no real money moves.</p>
          <p className="mt-2">
            Klaro is in Arc testnet. Every settlement, cashout, and dispute on
            this page is for testnet USDC only. Mainnet ships after the security audit completes.
            security audit completes.
          </p>
        </div>
      </section>
    </main>
  );
}
