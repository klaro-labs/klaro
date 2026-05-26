import Link from "next/link";
import type { Route } from "next";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { type LPApplicationStatus } from "@/lib/mockData";
import { getCurrentLpSession } from "@/lib/auth";
import { formatUSDC, relativeTime } from "@/lib/money";

/** Order of the 8 onboarding screens, mapped to LP status. v2 §22.5. */
const STEPS: Array<{ label: string; href: Route; key: LPApplicationStatus[] }> =
  [
    { label: "Invite", href: "/lp/apply" as Route, key: ["INVITED"] },
    { label: "Application", href: "/lp/apply" as Route, key: ["DRAFT"] },
    { label: "Documents", href: "/lp/docs" as Route, key: ["DOCS_UPLOADED"] },
    { label: "Review", href: "/lp" as Route, key: ["UNDER_REVIEW"] },
    { label: "Stake", href: "/lp/stake" as Route, key: ["APPROVED"] },
    { label: "Walkthrough", href: "/lp/walkthrough" as Route, key: ["STAKED"] },
    { label: "Queue", href: "/lp/queue" as Route, key: ["STAKED"] },
    {
      label: "Disputes",
      href: "/lp/disputes-explainer" as Route,
      key: ["STAKED"],
    },
  ];

const STATUS_TONE: Record<
  LPApplicationStatus,
  "live" | "info" | "neutral" | "sim"
> = {
  INVITED: "info",
  DRAFT: "info",
  DOCS_UPLOADED: "info",
  UNDER_REVIEW: "sim",
  APPROVED: "sim",
  STAKED: "sim",
  REJECTED: "neutral",
  SUSPENDED: "neutral",
  REVOKED: "neutral",
};

export default async function LPHomePage() {
  // derive LP from session, not array[0].
  const session = await getCurrentLpSession();
  const lp = session?.lp ?? null;

  if (!lp) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName="LP" />
        <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
          <h1 className="font-display text-3xl font-semibold">
            No LP application yet
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Klaro liquidity providers are invite-only. Request access at{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:lp@klaro.so"
            >
              lp@klaro.so
            </a>
            .
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={lp.legalEntityName ?? lp.contactEmail} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Liquidity provider portal
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Welcome, {lp.legalEntityName ?? "Klaro LP"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              This simulator previews LP handling of vendor cashout requests.
              Move through the steps below to exercise demo orders. Updated{" "}
              {relativeTime(lp.updatedAt)}.
            </p>
          </div>
          <Badge tone={STATUS_TONE[lp.status]}>
            {lp.status.replace("_", " ")}
          </Badge>
        </div>

        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const reached =
              step.key.includes(lp.status) || stepReached(i, lp.status);
            const current = step.key.includes(lp.status);
            return (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={`flex items-center justify-between rounded-lg border px-5 py-4 transition-colors ${
                    current
                      ? "border-[var(--color-brand)] bg-white"
                      : reached
                        ? "border-[var(--color-line)] bg-white hover:border-[var(--color-brand)]"
                        : "border-dashed border-[var(--color-line)] bg-[var(--color-bg)] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                        reached
                          ? "bg-[var(--color-ink)] text-white"
                          : "bg-[var(--color-line)] text-[var(--color-ink-subtle)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-medium">{step.label}</span>
                  </div>
                  <span className="text-xs text-[var(--color-ink-subtle)]">
                    {current ? "Current step →" : reached ? "View" : "Locked"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm">
          <p className="font-medium">Stake on file</p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            {lp.stakedUsdc > 0n
              ? formatUSDC(lp.stakedUsdc) + " demo · Tier T" + lp.tier
              : "No stake yet — complete review then post collateral"}
          </p>
        </div>
      </section>
    </main>
  );
}

/** Onboarding state machine — STAKED satisfies every step. */
function stepReached(stepIndex: number, status: LPApplicationStatus): boolean {
  const order: LPApplicationStatus[] = [
    "INVITED",
    "DRAFT",
    "DOCS_UPLOADED",
    "UNDER_REVIEW",
    "APPROVED",
    "STAKED",
    "STAKED",
    "STAKED",
  ];
  let lpIndex = -1;
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i] === status) {
      lpIndex = i;
      break;
    }
  }
  return lpIndex >= stepIndex;
}
