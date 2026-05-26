import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { mockListClaimableCashouts } from "@/lib/mockData";
import { getCurrentLpSession } from "@/lib/auth";
import { formatUSDC, relativeTime } from "@/lib/money";

export const metadata = { title: "Dashboard · Klaro LP" };

export default async function LPDashboardPage() {
  // Audit fix (loop ): derive LP from session, not array[0].
  const session = await getCurrentLpSession();
  const lp = session?.lp ?? null;
  const open = await mockListClaimableCashouts();
  const entityName = lp?.legalEntityName ?? lp?.contactEmail ?? "Klaro LP";

  if (!lp || lp.status !== "STAKED") {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName={entityName} />
        <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
          <h1 className="font-display text-3xl font-semibold">
            Onboarding not complete
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Finish the onboarding flow before claiming orders.{" "}
            <Link
              href="/lp"
              className="text-[var(--color-brand)] hover:underline"
            >
              Open checklist →
            </Link>
          </p>
        </section>
      </main>
    );
  }

  const lpClaims = open.length;
  const queueVolume = open.reduce((sum, c) => sum + c.usdcAmount, 0n);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              LP dashboard · {entityName}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Today
            </h1>
          </div>
          <Badge tone="sim">Simulated · Tier T{lp.tier}</Badge>
        </header>

        <div className="mb-10 grid gap-3 md:grid-cols-4">
          <Tile
            label="Stake on file"
            value={formatUSDC(lp.stakedUsdc)}
            unit="USDC"
          />
          <Tile label="Open queue" value={String(lpClaims)} unit="claimable" />
          <Tile
            label="Queue volume"
            value={formatUSDC(queueVolume)}
            unit="USDC"
          />
          <Tile label="Reputation" value="—" unit="demo" />
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Recent orders
        </h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
            Queue is empty. Cashout requests appear here when the routing engine
            matches them to your tier and corridor.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {open.slice(0, 6).map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center"
              >
                <Link href="/lp/queue" className="hover:underline">
                  <div className="font-medium">
                    {c.currency} · {formatUSDC(c.usdcAmount)}
                  </div>
                  <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                    {c.id.slice(0, 10)}…
                  </div>
                </Link>
                <span className="text-sm">{c.currency}</span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {relativeTime(c.requestedAt)}
                </span>
                <Badge tone="info">LOCKED</Badge>
                <Link
                  href="/lp/queue"
                  className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--color-brand)]"
                >
                  Claim
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <NavCard
            href="/lp/queue"
            title="Demo queue"
            body="Preview cashout orders matched to your simulated tier and corridor."
          />
          <NavCard
            href="/lp/reputation"
            title="Reputation"
            body="Preview score, slash history and tier progression."
          />
          <NavCard
            href="/lp/settings"
            title="Settings"
            body="Update payout wallet, corridors, notification preferences."
          />
        </div>
      </section>
    </main>
  );
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">
        {unit}
      </div>
    </div>
  );
}

function NavCard({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href as never}
      className="rounded-lg border border-[var(--color-line)] bg-white p-5 transition-colors hover:border-[var(--color-brand)]"
    >
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{body}</p>
      <span className="mt-3 inline-block text-xs text-[var(--color-brand)]">
        Open →
      </span>
    </Link>
  );
}
