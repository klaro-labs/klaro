/**
 * Trust strip: STANDARDS AND INFRASTRUCTURE WE BUILD ON.
 * Inline row of name-only labels. Real partner marks land once brand assets
 * are cleared for use.
 */
const ITEMS = [
  "Arc",
  "Circle",
  "USDC",
  "EURC",
  "CCTP V2",
  "ERC-8004",
  "ERC-8183",
] as const;

export function TrustStrip() {
  return (
    <section className="border-y border-[var(--color-line)] bg-[var(--color-bg)] py-[clamp(28px,4vw,52px)]">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)]">
        <p className="text-center font-mono text-[11px] font-medium tracking-[0.2em] uppercase text-[var(--color-muted)]">
          Standards and infrastructure we build on
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-around gap-x-6 gap-y-4">
          {ITEMS.map((label) => (
            <li key={label} className="text-base font-normal text-[var(--color-muted)]">
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
