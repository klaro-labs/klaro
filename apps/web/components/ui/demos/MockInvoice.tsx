/**
 * Static demo invoice card for marketing pages. Mirrors the visual language of
 * the real /vendor/invoices/[id] surface without coupling to session, DB, or
 * on-chain reads. Every value is a labelled "Demo" — no fake vendor names,
 * no real Tx hashes. Safe to SSR anywhere.
 */
export function MockInvoice() {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Invoice · Demo
          </p>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight">
            INV-0001
          </p>
        </div>
        <span className="rounded-pill bg-[var(--color-klaro-gold-soft)] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-klaro-gold-deep)]">
          Awaiting payment
        </span>
      </div>

      <div className="mt-6 border-t border-[var(--color-line)] pt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Amount due
        </p>
        <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight">
          1,250<span className="text-[var(--color-muted)]">.00</span>{" "}
          <span className="text-base font-medium text-[var(--color-muted)]">USDC</span>
        </p>
      </div>

      <dl className="mt-6 space-y-2.5 border-t border-[var(--color-line)] pt-5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Issued</dt>
          <dd className="font-medium">Demo date</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Due</dt>
          <dd className="font-medium">Demo · 14 days</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Settles on</dt>
          <dd className="font-medium">Arc</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Quote freeze</dt>
          <dd className="font-medium">15 min</dd>
        </div>
      </dl>

      <div className="mt-6 rounded-md bg-[var(--color-bg-warm)] p-3 font-mono text-[11px] text-[var(--color-muted)]">
        klaro.so/i/demo
      </div>
    </div>
  );
}
