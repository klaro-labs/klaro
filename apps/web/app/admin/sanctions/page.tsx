import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { listRecentScreenCache } from "@/lib/repo/counterpartyCache";
import {
  isCounterpartyLiveOnChain,
  readDenylistEntries,
} from "@/lib/arcClient";
import { relativeTime, shortAddress } from "@/lib/money";

export const metadata = { title: "Sanctions cache · Klaro admin" };

/** Each provider's `live` flag flips on when the env var that holds its
 * credential is set. Until then the daemon's `sanctionsRefresh` worker logs
 * `[SIMULATED] skipped` honestly. Audit finding L1 (2026-05-25). */
// read provider creds via lib/env.ts (not process.env
// directly) so the drift-guard + .env.example sweep catches future
// drift. env.ts is the single audit-trail boundary per its docstring.
import {
  CHAINALYSIS_API_KEY,
  TRM_API_KEY,
  SUMSUB_APP_TOKEN,
  ELLIPTIC_API_KEY,
} from "@/lib/env";

function providerRows() {
  return [
    {
      name: "Chainalysis Sanctions",
      source: "OFAC + EU + UN",
      live: Boolean(CHAINALYSIS_API_KEY),
      blockedBy: "CHAINALYSIS_API_KEY",
    },
    {
      name: "TRM Labs",
      source: "OFAC + Five Eyes",
      live: Boolean(TRM_API_KEY),
      blockedBy: "TRM_API_KEY",
    },
    {
      name: "Sumsub KYB Sanctions",
      source: "Legal-entity registries",
      live: Boolean(SUMSUB_APP_TOKEN),
      blockedBy: "SUMSUB_APP_TOKEN",
    },
    {
      name: "Elliptic Behavioral",
      source: "Wallet-cluster signals",
      live: Boolean(ELLIPTIC_API_KEY),
      blockedBy: "ELLIPTIC_API_KEY",
    },
  ];
}

export default async function AdminSanctionsPage() {
  const providers = providerRows();
  const recent = await listRecentScreenCache(50);
  const anyLive = providers.some((p) => p.live);
  // enumerate the actual on-chain
  // denylist by reading DenylistAdded/Removed events. Falls back to empty
  // when contract not deployed; surfaces error inline so the admin knows
  // the read crashed vs the chain genuinely had no entries.
  const denylist = await readDenylistEntries();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Admin · Sanctions
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Sanctions cache
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Daily sync of OFAC, EU, UN, and partner lists into{" "}
              <code className="font-mono">counterparty_screen_cache</code>.
              Daemon refreshes nightly; operator may force-refresh any provider.
              Provider rows below switch from
              <code className="font-mono"> simulated</code> to{" "}
              <code className="font-mono">live</code> the moment their API key
              env var is set.
            </p>
          </div>
          <Badge tone={anyLive ? "live" : "sim"}>
            {anyLive ? "Partial live" : "All simulated"}
          </Badge>
        </header>

        <h2 className="mb-3 font-display text-xl font-semibold">Providers</h2>
        <ul className="mb-10 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {providers.map((p) => (
            <li
              key={p.name}
              className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_1.2fr_1fr_auto] md:items-center"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-[var(--color-ink-muted)]">
                {p.source}
              </span>
              {p.live ? (
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {p.blockedBy} set
                </span>
              ) : (
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  Blocked on <code className="font-mono">{p.blockedBy}</code>
                </span>
              )}
              <Badge tone={p.live ? "live" : "sim"}>
                {p.live ? "live" : "simulated"}
              </Badge>
            </li>
          ))}
        </ul>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Recent decisions
        </h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          From <code className="font-mono">counterparty_screen_cache</code>.
          Bundle hash anchors the off-chain evidence bundle the daemon wrote.
        </p>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            No cached decisions yet. The cache fills as buyers complete checkout
            + the daemon&apos;s screen-and-settle worker runs.
          </p>
        ) : (
          <ul className="mb-10 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {recent.map((d) => (
              <li
                key={d.buyerAddress}
                className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[1.2fr_1fr_1.4fr_auto] md:items-center"
              >
                <span className="font-mono text-sm">{d.buyerAddress}</span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  TTL {d.ttlSeconds}s
                </span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  {d.bundleHash}
                </span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(d.decidedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Denylist</h2>
          <Badge tone={isCounterpartyLiveOnChain() ? "live" : "sim"}>
            {denylist.source === "live-arc"
              ? `Live · ${denylist.entries.length} active`
              : denylist.source === "error"
                ? "Chain read failed"
                : "[SIMULATED] · contract not deployed"}
          </Badge>
        </div>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Source-of-truth is the on-chain{" "}
          <code className="font-mono">CounterpartyRegistry</code> contract.
          Operator updates via Foundry script{" "}
          <code className="font-mono">scripts/Deny.s.sol</code>; this table
          enumerates active entries by reading{" "}
          <code className="font-mono">DenylistAdded</code> +{" "}
          <code className="font-mono">DenylistRemoved</code> events from chain.
          {denylist.source === "error" && (
            <span className="mt-1 block text-rose-700">
              Read error: {denylist.error ?? "unknown"} — chain unreachable or
              address misconfigured.
            </span>
          )}
        </p>

        {denylist.entries.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            {isCounterpartyLiveOnChain()
              ? "No active denylist entries on chain."
              : "Empty until CounterpartyRegistry is deployed (NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS)."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {denylist.entries.map((e) => (
              <li
                key={e.buyer}
                className="grid grid-cols-1 gap-2 px-6 py-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
              >
                <span className="font-mono text-sm">{e.buyer}</span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  reason {shortAddress(e.reasonHash)}
                </span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  block {e.blockNumber.toString()}
                </span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  tx {shortAddress(e.txHash)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
