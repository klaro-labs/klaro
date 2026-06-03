import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { requireLp } from "@/lib/auth";
import { getLpReputation } from "@/lib/repo/lpReputation";
import { formatUSDC, relativeTime } from "@/lib/money";
import { LP_TIERS } from "@/lib/lpTiers";

export const metadata = { title: "Reputation · Klaro LP" };

export default async function LPReputationPage() {
  const { lp } = await requireLp();
  const rep = await getLpReputation(lp.lpId);
  const entityName = lp.legalEntityName ?? lp.contactEmail;
  const currentTier = lp.tier;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Reputation · demo preview</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Score & history
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              This page previews the score and tier design for{" "}
              <strong>{entityName}</strong>. It is not an on-chain reputation
              claim; verified event ingestion remains a live-mode requirement.
            </p>
          </div>
          <Badge tone="sim">Demo · Tier T{currentTier}</Badge>
        </header>

        {rep ? (
          <div className="mb-10 rounded-lg border border-[var(--color-line)] bg-white p-6">
            <div className="grid gap-6 md:grid-cols-4">
              <Stat label="Score" value={String(rep.score)} />
              <Stat
                label="Orders completed"
                value={String(rep.ordersCompleted)}
              />
              <Stat
                label="Disputes opened"
                value={String(rep.disputesOpened)}
              />
              <Stat label="Disputes lost" value={String(rep.disputesLost)} />
            </div>
            <p className="mt-6 text-xs text-[var(--color-ink-subtle)]">
              Median resolution {rep.medianMinutes ?? "—"} min · last calc{" "}
              {relativeTime(rep.lastCalcAt)}
            </p>
          </div>
        ) : (
          <div className="mb-10 rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            No demo reputation data yet for {entityName}. Exercise a simulated
            order from the{" "}
            <Link
              href="/lp/queue"
              className="text-[var(--color-brand)] hover:underline"
            >
              queue
            </Link>{" "}
            to start.
          </div>
        )}

        <h2 className="mb-3 font-display text-xl font-semibold">
          Tier progression
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {LP_TIERS.map((t) => (
            <div
              key={t.tier}
              className={`rounded-lg border bg-white p-5 ${
                t.tier === currentTier
                  ? "border-[var(--color-brand)]"
                  : "border-[var(--color-line)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-semibold">
                  {t.label}
                </span>
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="text-[var(--color-ink-subtle)]">
                  Min stake
                </span>
                <span className="text-right font-mono">{t.minLabel}</span>
                <span className="text-[var(--color-ink-subtle)]">
                  Per order
                </span>
                <span className="text-right font-mono">{t.cap}</span>
              </div>
              <div className="mt-3 text-xs text-[var(--color-ink-subtle)]">
                Your stake: {formatUSDC(lp.stakedUsdc)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
