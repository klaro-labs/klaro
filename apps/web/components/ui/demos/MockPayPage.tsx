/**
 * Static demo of the public pay page (`/i/[id]`). Same visual rhythm as the
 * real surface, but no wagmi, no quote oracle, no live status. Used inside
 * MockBrowserChrome on marketing pages.
 */
const CHAINS = ["Arc", "Base", "Arbitrum", "Polygon", "Solana"];

export function MockPayPage() {
  return (
    <div className="bg-[var(--color-bg-dark)] p-6 text-white">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">
        Pay invoice · Demo
      </p>
      <p className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight">
        Pay 1,250.00 USDC
      </p>
      <p className="mt-1.5 text-sm text-white/65">to vendor demo workspace</p>

      <div className="mt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          Pay from any chain
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHAINS.map((c) => (
            <span
              key={c}
              className="rounded-pill border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-white/80"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-3 font-mono text-[11px] text-white/70">
        www.myklaro.app/i/demo · scan or paste anywhere
      </div>

      <button
        type="button"
        disabled
        className="mt-5 w-full rounded-md bg-[var(--color-klaro-orange)] py-2.5 text-center text-sm font-medium text-white opacity-90"
      >
        Connect wallet to pay
      </button>
    </div>
  );
}
