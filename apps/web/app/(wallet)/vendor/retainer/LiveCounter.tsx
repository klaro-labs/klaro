"use client";

import { useEffect, useState } from "react";

interface Props {
  /** depositUsdc / withdrawnUsdc / startMs / endMs / cancelledAt? / cancelledVested? */
  s: {
    depositUsdcStr: string;
    withdrawnUsdcStr: string;
    startMs: number;
    endMs: number;
    cancelledAtMs?: number;
    cancelledVestedStr?: string;
  };
}

function fmt(microUsdc: bigint): string {
  const whole = microUsdc / 1_000_000n;
  const frac = microUsdc % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 4);
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

function vestedAt(
  deposit: bigint,
  startMs: number,
  endMs: number,
  atMs: number,
): bigint {
  if (atMs <= startMs) return 0n;
  const cap = atMs >= endMs ? endMs : atMs;
  const elapsed = BigInt(cap - startMs);
  const span = BigInt(endMs - startMs);
  return (deposit * elapsed) / span;
}

export function LiveCounter({ s }: Props) {
  const deposit = BigInt(s.depositUsdcStr);
  const withdrawn = BigInt(s.withdrawnUsdcStr);
  const cancelledVested = s.cancelledVestedStr
    ? BigInt(s.cancelledVestedStr)
    : undefined;

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (s.cancelledAtMs) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s.cancelledAtMs]);

  const vested = cancelledVested ?? vestedAt(deposit, s.startMs, s.endMs, now);
  const withdrawable = vested > withdrawn ? vested - withdrawn : 0n;
  const ratePerSec =
    ((deposit * 1n) / BigInt(Math.max(1, s.endMs - s.startMs))) * 1000n;

  return (
    <div className="grid grid-cols-2 gap-3 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-4 text-sm md:grid-cols-4">
      <Field label="Vested" value={`$${fmt(vested)}`} />
      <Field label="Withdrawable" value={`$${fmt(withdrawable)}`} highlight />
      <Field label="Already withdrawn" value={`$${fmt(withdrawn)}`} />
      <Field label="Rate / sec" value={`$${fmt(ratePerSec)}`} />
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div
        className={`mt-1 font-mono ${highlight ? "text-[var(--color-brand)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
