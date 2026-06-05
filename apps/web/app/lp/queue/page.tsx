import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentLpSession } from "@/lib/auth";
import { mockListClaimableCashouts } from "@/lib/mockData";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { getCorridor, formatPayout } from "@/lib/corridors";
import { claimOrderAction } from "@/app/lp/actions";

/** LP claimable-orders queue. Audit fix (loop iter 5, 2026-05-25): previous
 * version used `mockListLPs()[0]` so every signed-in user saw the seed LP's
 * eligibility + status. The form action was gated by `requireLp()` after
 * workstream A, but the visible UI still lied about who the viewer was.
 * Now derives the LP from session — non-LP visitors see a clear "not an LP"
 * empty state with a contact CTA, not a fake queue. */
export default async function LPQueuePage() {
  const session = await getCurrentLpSession();

  if (!session) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName="Klaro LP" />
        <section className="mx-auto w-full max-w-[700px] px-6 py-16 text-center">
          <Eyebrow>LP queue</Eyebrow>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            You&apos;re not an admitted LP.
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Klaro routes vendor cashouts through invited liquidity partners
            only. If your firm wants to apply, email{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:prateek@myklaro.app"
            >
              prateek@myklaro.app
            </a>{" "}
            with your legal entity name + country.
          </p>
          <Link
            href="/lp"
            className={`mt-6 ${buttonVariants({ variant: "secondary", size: "sm" })}`}
          >
            Back to LP overview
          </Link>
        </section>
      </main>
    );
  }

  const { lp } = session;
  const entityName = lp.legalEntityName ?? lp.contactEmail;
  const orders = await mockListClaimableCashouts();
  const eligible = lp.status === "STAKED";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Step 5 of 6 · Demo queue</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Claimable orders
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Simulated vendor cashouts within your tier and corridor. Claiming
              advances demo state only; no stake or funds move.
            </p>
          </div>
          <Badge tone="sim">
            {eligible
              ? `Simulated · Tier T${lp.tier}`
              : `Not yet staked (${lp.status.toLowerCase().replace("_", " ")})`}
          </Badge>
        </div>

        {!eligible && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Complete onboarding before claiming.</p>
            <p className="mt-1 text-xs">
              Visit{" "}
              <Link href="/lp" className="underline">
                your LP checklist
              </Link>{" "}
              to finish KYB + stake. Orders below preview what the queue looks
              like; the Claim button is disabled until your status is STAKED.
            </p>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
            No demo orders in the queue right now. New simulated cashout orders
            appear here after the vendor flow is exercised.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {orders.map((o) => {
              const c = getCorridor(o.currency);
              return (
                <li
                  key={o.id}
                  className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
                >
                  <div>
                    <div className="font-medium">
                      {formatUSDC(o.usdcAmount)} USDC → {c?.code ?? o.currency}
                    </div>
                    <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                      {shortAddress(o.id)} · vendor{" "}
                      {shortAddress(o.vendorWallet)}
                    </div>
                  </div>
                  <div className="text-sm">
                    {c
                      ? formatPayout(o.payoutMinor, c)
                      : (Number(o.payoutMinor) / 100).toFixed(2) +
                        " " +
                        o.currency}
                  </div>
                  <div className="text-xs text-[var(--color-ink-subtle)]">
                    {relativeTime(o.requestedAt)} · quote{" "}
                    {Math.max(
                      0,
                      Math.round((+o.quoteExpiresAt - Date.now()) / 1000),
                    )}
                    s left
                  </div>
                  <form action={claimOrderAction}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!eligible || o.status !== "REQUESTED"}
                      className="h-11 w-full rounded-pill md:h-9 md:w-auto"
                    >
                      {o.status === "REQUESTED" ? "Claim" : o.status}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-xs text-[var(--color-ink-subtle)]">
          Live mode: clicking Claim calls{" "}
          <code className="font-mono">CashoutOrderProcessor.claimByLP()</code>{" "}
          via the operator (reverts if LP suspended/not-active in{" "}
          <code className="font-mono">LPRegistry</code>). Simulator mode: no
          chain calls; mock store advances order state.
        </p>
      </section>
    </main>
  );
}
