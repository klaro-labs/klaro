import { cn } from "@/lib/cn";
import { formatUSDC } from "@/lib/money";
import type { VendorBalances } from "@/lib/types";

/**
 * BalanceCard — explicit 6-balance breakdown
 * (no overclaiming): we NEVER collapse these into one
 * "Total Balance" — vendors need to know what's actually theirs vs locked
 * vs held. Each cell has a tooltip-worthy label explaining the state.
 */

const LABELS: Record<keyof VendorBalances, { title: string; explain: string }> =
  {
    available: {
      title: "Available",
      explain: "Settled USDC ready to use or cash out.",
    },
    pending: {
      title: "Pending",
      explain: "Invoices paid but awaiting screening + settlement.",
    },
    locked: { title: "Locked", explain: "Currently held in a cashout escrow." },
    held: {
      title: "Held",
      explain: "Frozen by a dispute; resolves when admin reviews.",
    },
    cashoutable: {
      title: "Cashoutable",
      explain: "Eligible for INR cashout request.",
    },
    simulated: {
      title: "Simulated",
      explain: "Testnet earnings — not real money.",
    },
  };

export function BalanceCard({ balances }: { balances: VendorBalances }) {
  return (
    <section
      aria-label="Balances"
      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Balances
        </h2>
        <span className="rounded-pill bg-[var(--color-bg)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)] ring-1 ring-inset ring-[var(--color-line)]">
          Testnet · USDC
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
        {(Object.keys(LABELS) as (keyof VendorBalances)[]).map((key) => {
          const { title, explain } = LABELS[key];
          const muted =
            key === "locked" || key === "held" || key === "simulated";
          return (
            <div key={key}>
              <dt
                title={explain}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-[0.18em]",
                  muted
                    ? "text-[var(--color-ink-subtle)]"
                    : "text-[var(--color-ink-muted)]",
                )}
              >
                {title}
              </dt>
              <dd
                className={cn(
                  "mt-1.5 font-display text-2xl font-semibold tracking-tight",
                  muted
                    ? "text-[var(--color-ink-muted)]"
                    : "text-[var(--color-ink)]",
                )}
              >
                {formatUSDC(balances[key])}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
