import { CheckIcon } from "@/components/ui/CheckIcon";

/**
 * Static demo receipt — mirrors the rows shipped by /receipt/[hash] without
 * pulling on-chain data. Fields are clearly labelled `demo` so the visual
 * conveys structure without claiming a real settlement happened.
 */
const ROWS: Array<{ k: string; v: string; mono?: boolean }> = [
  { k: "Amount", v: "1,250.00 USDC" },
  { k: "Payer", v: "0xdemo…payer", mono: true },
  { k: "Vendor", v: "0xdemo…vendor", mono: true },
  { k: "Chain", v: "Arc" },
  { k: "Block", v: "demo · finalized" },
  { k: "Tx", v: "0xdemo…tx", mono: true },
  { k: "Receipt hash", v: "0xdemo…receipt", mono: true },
  { k: "Settled at", v: "Demo timestamp" },
];

export function MockReceipt() {
  return (
    <div className="bg-[var(--color-bg)] p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Stenn-Proof receipt · Demo
          </p>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight">
            Anchored on Arc
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-[var(--color-klaro-gold-soft)] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-klaro-gold-deep)]">
          <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full bg-[var(--color-klaro-gold)] text-[var(--color-ink)]">
            <CheckIcon className="size-2.5" />
          </span>
          Verified
        </span>
      </div>

      <dl className="mt-5 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
        {ROWS.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between py-2.5 text-[13px]">
            <dt className="text-[var(--color-muted)]">{r.k}</dt>
            <dd className={r.mono ? "font-mono text-[12px]" : "font-medium"}>
              {r.v}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-muted)]">
        Real receipts include EIP-712 acceptance signatures from both parties
        and a settlement transaction on Arc. Verify any receipt at{" "}
        <span className="font-mono">www.myklaro.app/receipt/&lt;hash&gt;</span>.
      </p>
    </div>
  );
}
