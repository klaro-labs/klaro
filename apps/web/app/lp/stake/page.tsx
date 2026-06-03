import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Input } from "@/components/ui/Input";
import { getCurrentLpSession } from "@/lib/auth";
import { formatUSDC } from "@/lib/money";
import { LP_TIERS } from "@/lib/lpTiers";
import { stakeAction } from "../actions";

export default async function LPStakePage() {
  // Audit fix (loop ): derive LP from session, not array[0].
  const session = await getCurrentLpSession();
  if (!session) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName="Klaro LP" />
        <section className="mx-auto w-full max-w-[700px] px-6 py-16 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Not an admitted LP.
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Staking is gated to invited + approved LPs.{" "}
            <Link
              href="/lp"
              className="text-[var(--color-brand)] hover:underline"
            >
              LP overview →
            </Link>
          </p>
        </section>
      </main>
    );
  }
  const { lp } = session;
  const entityName = lp.legalEntityName ?? lp.contactEmail;
  const eligible = lp.status === "APPROVED" || lp.status === "STAKED";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Step 3 of 6 · Stake</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Post collateral
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Stake USDC into{" "}
              <code className="font-mono text-xs">LPStaking</code>. Klaro
              slashes a fraction on bad-faith disputes; the rest is refundable
              on offboarding (30-day cool-down).
            </p>
          </div>
          <Badge
            tone={
              lp.status === "STAKED" ? "info" : eligible ? "info" : "neutral"
            }
          >
            {lp.status === "STAKED"
              ? `${formatUSDC(lp.stakedUsdc)} staked · T${lp.tier}`
              : eligible
                ? "Ready to stake"
                : "Complete review first"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {LP_TIERS.map((t) => (
            <div
              key={t.tier}
              className={`rounded-lg border bg-white p-4 text-sm ${
                lp.tier === t.tier
                  ? "border-[var(--color-brand)]"
                  : "border-[var(--color-line)]"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-lg font-semibold">
                  {t.label}
                </span>
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {t.minLabel}+
                </span>
              </div>
              <div className="mt-2 text-xs text-[var(--color-ink-muted)]">
                {t.cap}
              </div>
              <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                {t.description}
              </p>
            </div>
          ))}
        </div>

        <form
          action={stakeAction}
          className="mt-8 grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[1fr_auto] md:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Stake amount (USDC)
            </span>
            <Input
              name="amount"
              type="number"
              min="50"
              step="10"
              required
              defaultValue={
                lp.stakedUsdc ? Number(lp.stakedUsdc) / 1_000_000 : 500
              }
              disabled={!eligible}
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={!eligible}
            className="h-11 w-full md:h-9 md:w-auto"
          >
            {lp.status === "STAKED" ? "Update stake" : "Confirm stake →"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-[var(--color-ink-subtle)]">
          Records your stake amount + tier in Klaro. The on-chain{" "}
          <code className="font-mono">LPStaking.register()</code> USDC custody
          is partner-pending — no USDC is pulled or locked on-chain yet, so this
          updates your LP record without a token transfer.
        </p>
      </section>
    </main>
  );
}
