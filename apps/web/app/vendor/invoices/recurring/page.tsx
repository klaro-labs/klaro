import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockListRecurring } from "@/lib/mockData";
import { formatUSDC, relativeTime } from "@/lib/money";
import { getT } from "@/lib/i18n";
import { createRecurringAction } from "./actions";

export default async function RecurringPage() {
  const t = await getT();
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const items = await mockListRecurring(session.vendor.id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              {t("recurring.title")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {t("recurring.title")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-ink-muted)]">
              {t("recurring.description")}
            </p>
          </div>
          <Badge tone="sim">Scheduling lands soon</Badge>
        </div>

        <form
          action={createRecurringAction}
          className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Customer email
            </span>
            <input
              name="customerEmail"
              type="email"
              required
              placeholder="lina@buyerco.com"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Amount (USDC)</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="500.00"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
            <span className="text-[var(--color-ink-muted)]">Description</span>
            <input
              name="description"
              type="text"
              required
              placeholder="Monthly retainer — design"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Frequency</span>
            <select
              name="frequency"
              defaultValue="monthly"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              {t("recurring.addRecurring")}
            </button>
          </div>
        </form>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Active schedules
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No recurring schedules yet. Add one above.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {items.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-1 gap-1 px-6 py-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
              >
                <div>
                  <div className="font-medium">{r.description}</div>
                  <div className="text-xs text-[var(--color-ink-subtle)]">
                    {r.customerEmail}
                  </div>
                </div>
                <div className="text-sm">{formatUSDC(r.amountUsdc)}</div>
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  {r.frequency}
                </div>
                <div className="text-xs text-[var(--color-ink-subtle)]">
                  next {relativeTime(r.nextRunAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
