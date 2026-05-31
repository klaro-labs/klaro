import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockGetAgent } from "@/lib/mockData";
import { listForVendor as listAgentJobs } from "@/lib/repo/agentJobs";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";

export const metadata = { title: "Agent jobs · Klaro" };

const STATUS_TONE: Record<string, "live" | "info" | "sim" | "neutral"> = {
  CREATED: "info",
  FUNDED: "info",
  STARTED: "info",
  DELIVERED: "info",
  DISPUTED: "sim",
  CLOSED: "live",
  CANCELLED: "neutral",
};

export default async function VendorAgentJobsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const { id } = await params;
  const agent = await mockGetAgent(id);
  if (!agent) notFound();

  const allJobs = await listAgentJobs(session.vendor.id);
  const jobs = allJobs.filter((j) => j.agentId === id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <Link
          href="/vendor/agents"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← All agent jobs
        </Link>

        <header className="mt-4 mb-8 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              ERC-8183 escrow · jobs you funded
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {agent.displayName}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {jobs.length} job{jobs.length === 1 ? "" : "s"} ·{" "}
              <code className="font-mono text-xs">
                {shortAddress(agent.owner)}
              </code>
            </p>
          </div>
          <Link
            href={`/agents/${id}`}
            className="rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:border-[var(--color-brand)]"
          >
            View agent
          </Link>
        </header>

        {jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            No jobs yet for this agent.{" "}
            <Link
              href="/vendor/agents"
              className="text-[var(--color-brand)] hover:underline"
            >
              Hire from your agents dashboard
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {jobs.map((j) => (
              <li
                key={j.jobId}
                className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_auto_auto_auto_auto] md:items-center"
              >
                <div>
                  <div className="font-medium line-clamp-1">
                    {j.description}
                  </div>
                  <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                    {shortAddress(j.jobId)}
                  </div>
                </div>
                <span className="text-sm">{formatUSDC(j.amountUsdc)}</span>
                <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  +{formatUSDC(j.feeUsdc)} fee
                </span>
                <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(j.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
