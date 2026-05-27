import { notFound } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { Badge } from "@/components/ui/Badge";
import { mockGetAgent, mockListAgents } from "@/lib/mockData";
import { formatUSDC, shortAddress } from "@/lib/money";

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const a = await mockGetAgent(agentId);
  return { title: a ? `${a.displayName} · Klaro agents` : "Agent · Klaro" };
}

export async function generateStaticParams() {
  const agents = await mockListAgents();
  return agents.map((a) => ({ agentId: a.agentId }));
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = await mockGetAgent(agentId);
  if (!agent) notFound();

  return (
    <main className="bg-[var(--color-paper)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1100px] px-6 pt-16 pb-12">
        <Link
          href="/agents"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← All agents
        </Link>

        <div className="mt-6 flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-brand)]">
              {agent.category}
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
              {agent.displayName}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-ink)]/80">
              {agent.description}
            </p>
          </div>
          <Badge tone={agent.active ? "live" : "sim"}>
            {agent.active ? "Active · ERC-8004" : "Inactive"}
          </Badge>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <Stat
            label="Price per call"
            value={formatUSDC(agent.pricePerCallUsdc)}
            unit="USDC"
          />
          <Stat
            label="Klaro fee"
            value={`${(agent.feeBps / 100).toFixed(2)}%`}
            unit="of price"
          />
          <Stat
            label="Owner"
            value={shortAddress(agent.owner)}
            unit="wallet"
            mono
          />
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold">
              Pricing endpoint
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              Agents publish a live quote endpoint. Klaro reads it before each
              job to pin price + ETA into the on-chain escrow.
            </p>
            <code className="mt-4 block break-all font-mono text-xs text-[var(--color-brand)]">
              {agent.pricingEndpointUrl}
            </code>
          </div>

          <div className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold">Settlement</h2>
            <p className="mt-2 text-sm text-[var(--color-ink)]/80">
              Jobs are escrowed via ERC-8183 (AgentEscrow). Funds release on
              deliverable + principal accept, or stay locked through a
              DisputeManager case.
            </p>
            {/* Audit fix (loop iter 19, 2026-05-25): two gaps —
                (a) the CTA dropped `?hire=` so vendor landed in the empty form
                    instead of the preselected one (marketplace page already
                    sends the param; both entry points should behave the same),
                (b) inactive agents still rendered the Hire CTA — vendor would
                    submit, action would reject, and the bounce would look like
                    a Klaro bug rather than agent state. Now an inactive agent
                    shows an honest disabled state. */}
            {agent.active ? (
              <Link
                href={`/vendor/agents?hire=${agent.agentId}`}
                className="mt-4 inline-block rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Hire from vendor app →
              </Link>
            ) : (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-ink)]/15 bg-[var(--color-bg)] px-5 py-2 text-sm font-medium text-[var(--color-ink-muted)]">
                <span>Agent inactive — owner must re-register</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--color-ink)]/10 bg-white p-6">
          <h2 className="font-display text-lg font-semibold">Agent ID</h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/80">
            Permanent ERC-8004 identifier. Used in every on-chain job escrow
            tied to this agent.
          </p>
          <code className="mt-3 block break-all font-mono text-xs text-[var(--color-ink-muted)]">
            {agent.agentId}
          </code>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
  mono,
}: {
  label: string;
  value: string;
  unit: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-ink)]/10 bg-white p-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div
        className={`mt-2 ${mono ? "font-mono" : "font-display"} text-2xl font-semibold`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--color-ink-muted)]">{unit}</div>
    </div>
  );
}
