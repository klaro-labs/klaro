"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  CORRIDORS,
  quoteCashout,
  formatPayout,
  getCorridor,
} from "@/lib/corridors";
import { formatUSDC, dollarsToUSDC } from "@/lib/money";
import { createCashoutAction } from "@/app/vendor/cashout/actions";

/**
 * CashoutRequestForm — amount + corridor selector + live quote.
 * The quote refreshes whenever amount or corridor changes. This form is a
 * simulator until a signed live cashout submission path is wired.
 */
// vendorId + vendorWallet removed from props — server action derives from
// session. .
export function CashoutRequestForm({ maxUsdc }: { maxUsdc: bigint }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amountDollars, setAmountDollars] = useState("100");
  const [currency, setCurrency] = useState("INR");

  const quote = useMemo(() => {
    const amt = dollarsToUSDC(Math.max(0, parseFloat(amountDollars) || 0));
    return quoteCashout(amt, currency);
  }, [amountDollars, currency]);

  const corridor = getCorridor(currency);
  const overLimit = quote && quote.usdcAmount > maxUsdc;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!quote) return setError("Pick a valid corridor.");
        if (overLimit)
          return setError("Amount exceeds your cashoutable balance.");
        start(async () => {
          try {
            const id = await createCashoutAction({
              usdcAmount: quote.usdcAmount.toString(),
              payoutMinor: quote.payoutMinor.toString(),
              currency,
              klaroFeeUsdc: quote.klaroFeeUsdc.toString(),
              lpSpreadUsdc: quote.lpSpreadUsdc.toString(),
              quoteRate: quote.corridor.rate,
              quoteExpiresAtIso: quote.expiresAt.toISOString(),
            });
            router.push(`/vendor/cashout/${id}` as `/vendor/cashout/${string}`);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Cashout request failed.",
            );
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Amount (USD)">
          <input
            type="number"
            min={1}
            step="0.01"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 font-display text-2xl font-semibold tracking-tight focus:border-[var(--color-brand)] focus:outline-none"
          />
        </Field>
        <Field label="Corridor">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-[46px] rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus:border-[var(--color-brand)] focus:outline-none"
          >
            {CORRIDORS.map((c) => (
              <option key={c.code} value={c.currency}>
                {c.code} · {c.currency}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {quote && corridor ? (
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p>
              <span className="text-[var(--color-ink-subtle)]">
                You receive:
              </span>{" "}
              <strong className="font-display text-lg">
                {formatPayout(quote.payoutMinor, corridor)}
              </strong>
            </p>
            <Badge
              tone={
                corridor.status === "pilot" || corridor.status === "live"
                  ? "live"
                  : corridor.status === "access-gated"
                    ? "info"
                    : "sim"
              }
            >
              {corridor.status === "pilot" &&
                "INR pilot · simulated proof, no real INR moves"}
              {corridor.status === "live" && "Live"}
              {corridor.status === "access-gated" && "Access-gated"}
              {corridor.status === "simulation" &&
                "Simulation · partner-pending"}
            </Badge>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-[var(--color-ink-muted)]">
            <dt>Rate</dt>{" "}
            <dd>
              1 USDC = {corridor.rate.toLocaleString()} {corridor.currency}
            </dd>
            <dt>Klaro fee</dt>{" "}
            <dd>
              {formatUSDC(quote.klaroFeeUsdc)} (
              {(corridor.klaroFee * 100).toFixed(2)}%)
            </dd>
            <dt>LP spread</dt>{" "}
            <dd>
              {formatUSDC(quote.lpSpreadUsdc)} (
              {(corridor.lpSpread * 100).toFixed(2)}%)
            </dd>
            <dt>ETA</dt> <dd>≈ {corridor.etaMinutes} min</dd>
            <dt>Quote expires</dt> <dd>2 min</dd>
          </dl>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-5">
        <Button
          type="submit"
          size="lg"
          disabled={!quote || overLimit || pending}
        >
          {pending
            ? "Locking…"
            : `Simulate ${formatUSDC(quote?.usdcAmount ?? 0n)} cashout`}
        </Button>
        <p className="text-xs text-[var(--color-ink-subtle)]">
          Demo only: no USDC or local currency moves in this flow.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
