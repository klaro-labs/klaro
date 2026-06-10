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
import { createCashoutAction } from "@/app/(wallet)/vendor/cashout/actions";
import {
  RequestCashoutOnChain,
  type CashoutRequestInput,
} from "./RequestCashoutOnChain";
import type { Hex } from "@/lib/types";

/**
 * CashoutRequestForm — amount + corridor selector + live quote.
 * The quote refreshes whenever amount or corridor changes.
 *
 * Two submission paths:
 *  - On-chain (LF-3): when the vendor has a provisioned payout wallet, the
 *    quote feeds `RequestCashoutOnChain`, which has the vendor sign
 *    `approve` + `requestAndLock` so REAL USDC is escrowed in
 *    CashoutOrderProcessor. The operator daemon then advances the escrow to
 *    RELEASED (claimByLP → recordProof → operatorConfirmReceived).
 *  - Simulated: demo/no-wallet sessions fall back to the DB-only
 *    `createCashoutAction` — no funds move. Labelled as such.
 */
const ZERO_ADDR = ("0x" + "0".repeat(40)).toLowerCase();

export function CashoutRequestForm({
  maxUsdc,
  vendorWallet,
  simulated = false,
}: {
  maxUsdc: bigint;
  /** vendor's provisioned payout wallet; when present + non-zero the live
   *  on-chain lock path is offered instead of the simulator. */
  vendorWallet?: Hex | null;
  simulated?: boolean;
}) {
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

  const liveOnChain =
    !simulated && !!vendorWallet && vendorWallet.toLowerCase() !== ZERO_ADDR;
  const requestInput: CashoutRequestInput | null = quote
    ? {
        usdcAmount: quote.usdcAmount.toString(),
        payoutMinor: quote.payoutMinor.toString(),
        currency,
        klaroFeeUsdc: quote.klaroFeeUsdc.toString(),
        lpSpreadUsdc: quote.lpSpreadUsdc.toString(),
        quoteRate: quote.corridor.rate,
        quoteExpiresAtIso: quote.expiresAt.toISOString(),
      }
    : null;

  // amount + corridor inputs and the live quote panel are identical for both
  // paths; only the submit footer differs (signed lock vs. simulated insert).
  const fields = (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Amount (USD)">
          <input
            type="number"
            min={1}
            step="0.01"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 font-display text-2xl font-semibold tracking-tight focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
          />
        </Field>
        <Field label="Corridor">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-[46px] rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
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
          {/* Honest-mode: the Klaro fee is now withheld ON-CHAIN at settlement —
              CashoutOrderProcessor pays the LP (usdcAmount − klaroFee) and routes
              the fee to the fee receiver. The LP spread is not a separate
              transfer; it's built into the rate, so it's already reflected in
              "You receive" above. */}
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-ink-subtle)]">
            The Klaro fee is withheld on-chain at settlement — the LP is paid
            the cashout amount minus this fee. The LP spread is built into the
            rate above.
          </p>
        </div>
      ) : null}
    </>
  );

  // Live on-chain path (LF-3): the quote feeds the signed approve +
  // requestAndLock. Rendered OUTSIDE a <form> — RequestCashoutOnChain drives
  // its own button, so a form wrapper would double-fire on submit.
  if (liveOnChain && requestInput) {
    return (
      <div className="space-y-5">
        {fields}
        <div className="border-t border-[var(--color-line)] pt-5">
          {overLimit ? (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              Amount exceeds your cashoutable balance ({formatUSDC(maxUsdc)}).
            </p>
          ) : (
            <RequestCashoutOnChain
              input={requestInput}
              vendorWallet={vendorWallet as Hex}
            />
          )}
        </div>
      </div>
    );
  }

  // Simulated path (demo / no provisioned wallet): DB-only insert, no funds
  // move — labelled honestly.
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
      {fields}
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
