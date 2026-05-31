import { redirect } from "next/navigation";
import Link from "next/link";
import { keccak256, stringToBytes } from "viem";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { supabaseLive } from "@/lib/env";
import { mockListAgents, type AgentJobStatus } from "@/lib/mockData";
import { listForVendor as listAgentJobs } from "@/lib/repo/agentJobs";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { createJobAction, advanceJobAction } from "./actions";
import type { Hex } from "@/lib/types";

const STATUS_TONE: Record<
  AgentJobStatus,
  "live" | "info" | "neutral" | "sim" | "verified"
> = {
  CREATED: "info",
  FUNDED: "info",
  STARTED: "info",
  DELIVERED: "live",
  CLOSED: "verified",
  DISPUTED: "sim",
  CANCELLED: "neutral",
};

const NEXT_ACTION: Record<
  AgentJobStatus,
  { label: string; to: AgentJobStatus } | null
> = {
  CREATED: { label: "Fund job", to: "FUNDED" },
  FUNDED: { label: "Agent starts", to: "STARTED" },
  STARTED: { label: "Submit deliverable", to: "DELIVERED" },
  DELIVERED: { label: "Accept + release", to: "CLOSED" },
  DISPUTED: null,
  CLOSED: null,
  CANCELLED: null,
};

export default async function VendorAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ hire?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { hire } = await searchParams;
  // Agent-job lifecycle is PERSISTED for real (agent_jobs via lib/repo/agentJobs
  // + migration 0033) — read/create/advance all hit Supabase in live mode. The
  // on-chain AgentEscrow custody/release is NOT wired yet: it needs the agent to
  // hold an on-chain identity + wallet (mock registry today), so no USDC moves
  // in this flow. Surfaced honestly via the banner + per-stage labels below
  // rather than hidden behind a placeholder.
  const liveTracking = supabaseLive();
  const jobs = await listAgentJobs(session.vendor.id);
  const agents = await mockListAgents();
  const preselected = hire ? agents.find((a) => a.agentId === hire) : null;

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Agent jobs · 6-state lifecycle
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              My agent jobs
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Hire from{" "}
              <Link
                href="/agents"
                className="text-[var(--color-brand)] hover:underline"
              >
                the marketplace
              </Link>{" "}
              or directly with an agent ID, then track the engagement through
              its 6-state lifecycle.
            </p>
          </div>
          <Badge tone={liveTracking ? "info" : "sim"}>
            {liveTracking ? "Lifecycle tracked live" : "Simulated session"}
          </Badge>
        </div>

        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <span className="font-medium text-amber-900">
            On-chain escrow is partner-pending.
          </span>{" "}
          The job lifecycle below is recorded in Klaro
          {liveTracking ? " (persisted)" : " (simulated)"}, but{" "}
          <strong>no USDC moves on-chain yet</strong> — real{" "}
          <code className="font-mono">AgentEscrow</code> custody + release
          activate once the agent holds an on-chain identity (ERC-8004) +
          wallet.
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Hire an agent
        </h2>
        <form
          action={createJobAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Agent</span>
            <select
              name="agentId"
              defaultValue={preselected?.agentId ?? ""}
              required
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              <option value="">— pick —</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.displayName} · {formatUSDC(a.pricePerCallUsdc)} / call ·{" "}
                  {(a.feeBps / 100).toFixed(2)}% fee
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Budget (USDC)</span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              defaultValue="200"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
            <span className="text-[var(--color-ink-muted)]">
              Brief (≥ 10 chars)
            </span>
            <textarea
              name="description"
              required
              minLength={10}
              rows={3}
              placeholder="Competitor pricing scan for our Q3 SaaS launch (top 5 incumbents)."
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Open job
            </button>
          </div>
        </form>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Active jobs
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No jobs yet — open one above.
          </p>
        ) : (
          <ul className="space-y-4">
            {jobs.map((j) => {
              const next = NEXT_ACTION[j.status];
              return (
                <li
                  key={j.jobId}
                  className="rounded-lg border border-[var(--color-line)] bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{j.agentLabel}</div>
                      <p className="mt-1 max-w-xl text-sm text-[var(--color-ink-muted)]">
                        {j.description}
                      </p>
                      <div className="mt-2 font-mono text-xs text-[var(--color-ink-subtle)]">
                        job {shortAddress(j.jobId as `0x${string}`)} · agent{" "}
                        {shortAddress(j.agentId as `0x${string}`)}
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                        {formatUSDC(j.amountUsdc)} budget +{" "}
                        {formatUSDC(j.feeUsdc)} Klaro fee · opened{" "}
                        {relativeTime(j.createdAt)}
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                  </div>

                  {next && (
                    <form
                      action={async () => {
                        "use server";
                        // previous version
                        // synthesized `deliverableHash` from `Math.random()` — had no
                        // relationship to the actual deliverable bytes and broke
                        // the agent-side proof model. For the simulator path we
                        // derive a deterministic placeholder from `(jobId, current
                        // wall-clock minute)` so the hash is reproducible during
                        // demo + clearly tagged `[SIMULATED]` in audit logs. Real
                        // submit-deliverable belongs in an agent-side UI (M5+)
                        // where the agent uploads the artifact and we keccak the
                        // bytes server-side before calling
                        // AgentEscrow.submitDeliverable on chain.
                        const deliverable =
                          next.to === "DELIVERED"
                            ? {
                                deliverableHash: keccak256(
                                  stringToBytes(
                                    `[SIMULATED] ${j.jobId}:${Math.floor(Date.now() / 60_000)}`,
                                  ),
                                ) as Hex,
                              }
                            : undefined;
                        await advanceJobAction(j.jobId, next.to, deliverable);
                      }}
                      className="mt-3"
                    >
                      <button className="rounded bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white hover:bg-black">
                        {next.label} →
                      </button>
                      <span className="ml-2 text-[10px] text-[var(--color-ink-subtle)]">
                        Records this stage in Klaro · on-chain{" "}
                        <code className="font-mono">
                          AgentEscrow.
                          {next.to === "FUNDED"
                            ? "fundJob"
                            : next.to === "STARTED"
                              ? "startJob"
                              : next.to === "DELIVERED"
                                ? "submitDeliverable"
                                : "markCompleted"}
                          ()
                        </code>{" "}
                        settlement is partner-pending (no USDC moves)
                      </span>
                    </form>
                  )}

                  {j.deliverableHash && (
                    <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-subtle)]">
                      Deliverable hash: {shortAddress(j.deliverableHash)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
