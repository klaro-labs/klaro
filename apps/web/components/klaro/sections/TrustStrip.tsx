/**
 * Trust strip: standards + infrastructure Klaro builds on. Display-typeface
 * wordmarks at low opacity for the row that sits under the hero — same
 * rhythm as the prototype, no logos until partners clear brand assets.
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
    <section className="border-y border-[var(--color-line)] bg-[var(--color-bg)] py-[clamp(36px,5vw,64px)]">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)]">
        <p className="text-center font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-muted)]">
          Standards and infrastructure we build on
        </p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 md:gap-x-14">
          {ITEMS.map((label) => (
            <li
              key={label}
              className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink-3)] opacity-70 transition-opacity duration-150 hover:opacity-100 md:text-xl"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
