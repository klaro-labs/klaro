/**
 * §3 Trust strip — STANDARDS AND INFRASTRUCTURE WE BUILD ON.
 * Inline row of name-only logos (real partner logos land M3 once we have
 * brand assets cleared for use).
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
    // Designer 2026-05-25 parity: section is generously tall (~280px visible),
    // label sits in upper third with breathing room, logos distributed across
    // full width with even gaps. py-20 (was py-12) restores the breathing.
    <section className="border-y border-[var(--color-line)] bg-[var(--color-bg)] py-[clamp(48px,7vw,96px)]">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)]">
        <p className="text-center font-mono text-[11px] font-normal tracking-[0.2em] uppercase text-[var(--color-ink-subtle)]">
          Standards and infrastructure we build on
        </p>
        <ul className="mt-10 flex flex-wrap items-center justify-around gap-x-6 gap-y-4">
          {ITEMS.map((label) => (
            <li
              key={label}
              className="text-lg font-normal text-[var(--color-ink-muted)]"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
