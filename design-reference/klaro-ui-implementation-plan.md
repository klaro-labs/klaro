# Klaro UI Implementation Plan

Bridges the reference designs ([`klaro-brand-system.md`](klaro-brand-system.md), [`klaro-landing-flow.md`](klaro-landing-flow.md), [`klaro-mobile-screen-map.md`](klaro-mobile-screen-map.md)) into the existing `apps/web` codebase.

## Stack summary

- Next.js 15 App Router (`apps/web/app/`)
- React 19, TypeScript
- Tailwind v4 (no `tailwind.config.ts` — uses the `@theme` CSS-first config in `globals.css`)
- `class-variance-authority` + `clsx` + `tailwind-merge` for component variants
- `lucide-react` icons
- `@supabase/ssr` for auth + RLS-aware reads
- Section components already exist at `apps/web/components/klaro/sections/`

## Implementation order

The order respects principle 4 (build in order of trust) — tokens before pages, payments-grade screens before peripheral. Each step is shippable independently — landing keeps rendering between steps; nothing breaks.

### Step 1 — Brand tokens in Tailwind v4 theme

**File:** `apps/web/app/globals.css`

Replace any legacy palette inside `@theme` with the full token set from `klaro-brand-system.md`. Tailwind v4's `@theme inline` block lets every utility (`bg-bg-warm`, `text-ink`, `border-line`, `rounded-lg-klaro`) resolve to the design token.

Tokens to add (CSS variable name → Tailwind utility prefix):

```css
@theme inline {
  --color-klaro-orange: #C7522A;
  --color-klaro-orange-deep: #8E3414;
  --color-klaro-orange-soft: #FAEDE5;
  --color-klaro-gold: #F5B100;
  --color-klaro-gold-soft: #FFF6DD;
  --color-ink: #0A0A0A;
  --color-ink-2: #1A1A1A;
  --color-ink-3: #2E2E2E;
  --color-muted: #6B6B6B;
  --color-muted-2: #8A8A8A;
  --color-line: rgb(10 10 10 / 0.08);
  --color-line-2: rgb(10 10 10 / 0.14);
  --color-bg: #FFFFFF;
  --color-bg-warm: #FAFAF7;
  --color-bg-cool: #F4F6FA;
  --color-bg-dark: #0A0A0A;
  --color-bg-dark-2: #131313;

  --radius-sm: 8px;
  --radius: 14px;
  --radius-lg: 22px;
  --radius-xl: 32px;

  --font-display: "Inter Tight", "Inter", ui-sans-serif, system-ui;
  --font-body: "Inter", ui-sans-serif, system-ui;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
}
```

Naming note: the reference uses `--klaro-blue` for the terracotta colour. Production uses `--color-klaro-orange` to match what the eye sees. Document this in the brand-kit page to prevent confusion.

Also: load Inter, Inter Tight, JetBrains Mono via `next/font/google` in `apps/web/app/layout.tsx` and assign to the three CSS variables.

### Step 2 — Replace `Nav.tsx` + `Hero.tsx`

**Files:**
- `apps/web/components/klaro/Nav.tsx`
- `apps/web/components/klaro/Hero.tsx`

Nav changes:
- Sticky transparent + backdrop-blur on scroll
- Logo + wordmark left, 6 routes centre (Product / Developers / Pricing / Company / Roadmap / Trust), pill pair right (Sign in outline + Open klaro dark)
- Active route underlines in `--color-klaro-orange`

Hero changes:
- Two eyebrow pills row
- Display headline with terracotta accent word
- 3-line lede, two CTAs (dark primary + outline secondary)
- Status strip below CTAs
- Right column: two product cards (hosted invoice + Stenn-Proof receipt) showing real testnet data when available, deterministic fallback otherwise

### Step 3 — Rebuild remaining 15 landing sections

In order — each lands independently:

1. `TrustStrip.tsx` (already exists, mostly correct)
2. `HowItWorks.tsx` — three numbered step cards with mono `≈30s` / `≈8s` / `≈1.4s` timing pills
3. `PlatformOS.tsx` — title + 4 surface cards (Invoices, Partner Cashout, Reputation, Klaro Lab)
4. New `Reputation.tsx` + `LabPreview.tsx` (or extend `PlatformOS`) — 2-up row
5. `TruthTable.tsx` — 17×3 table with badge tones
6. `StennProof.tsx` — 2-up comparison (Traditional PDF vs Stenn-Proof) + Stenn collapse explainer card on dark
7. `PartnerCashout.tsx` — order timeline + 5 trust pillars
8. `Corridors.tsx` — 11-row table with country flags
9. `ThreeAudiences.tsx` — 3-up vendor / buyer / developer cards
10. `ErpIntegrations.tsx` — 6 ERP cards
11. `Developers.tsx` — code snippet + grid
12. `Security.tsx` — 4 pillars + status row
13. `MetricsBand.tsx` — live-on-Arc metrics band
14. `Pricing.tsx` — 3-up (Testnet · Standard · Scale) with middle column dark
15. `FinalCta.tsx` + `Footer.tsx` — final CTA + footer

### Step 4 — Polished `/brand-kit` page

**File:** `apps/web/app/brand-kit/page.tsx`

The current route exists as a stub. Replace with the brand-kit-reference layout:
- Hero: "How Klaro looks, sounds, and shows up."
- Sidebar table of contents (Identity · Logo · Color · Typography · Voice & tone · Components · Stenn-Proof badge · Imagery · Usage rules · Downloads)
- Each section ships as its own component for reusability inside the product

Brand-kit components to create:
- `apps/web/components/brand-kit/IdentitySection.tsx`
- `LogoSection.tsx` — three lock-ups (horizontal, mark-only, inverse) + clearspace + minimum size
- `ColorSection.tsx` — palette swatches with hex + use case
- `TypographySection.tsx` — three families with sample lines
- `VoiceToneSection.tsx` — do/don't side-by-side
- `ComponentsSection.tsx` — live samples of buttons, pills, inputs, cards
- `StennProofBadgeSection.tsx` — receipt badge in light + dark
- `ImagerySection.tsx` — image treatment rules
- `UsageRulesSection.tsx` — yes/no examples
- `DownloadsSection.tsx` — SVG/PNG asset links

### Step 5 — Mobile polish pass

Per [`klaro-mobile-screen-map.md`](klaro-mobile-screen-map.md), update each high-volume route's mobile layout:

Priority order:
1. `/vendor` — bottom nav + balance breakdown + activity feed
2. `/vendor/invoices` + `/vendor/invoices/[id]` — share sheet + screening status
3. `/i/[id]` — buyer hosted invoice + wallet picker + cross-chain route timeline
4. `/receipt/[hash]` — receipt page mobile rhythm
5. `/vendor/cashout` + `/vendor/cashout/quote` + `/vendor/cashout/[id]` — quote sheet + timeline
6. `/signin` — onboarding flow with the welcome → setup → ready arc
7. `/vendor/reputation` — score overview + history + unlock
8. `/vendor/settings` — profile + security

Components to add:
- `apps/web/components/klaro/MobileBottomNav.tsx` (new)
- `apps/web/components/klaro/BalanceBreakdown.tsx` (6-row card per v2 §17A)
- `apps/web/components/klaro/RouteTimeline.tsx` (cross-chain status strip)
- `apps/web/components/klaro/StatusPill.tsx` (consolidate the existing scattered pill renders)

### Step 6 — Component primitives

Build small primitive library to avoid each section reinventing pills, mono badges, and cards:

- `apps/web/components/ui/Pill.tsx` — with `tone` prop (`warm` / `gold` / `dark` / `default`)
- `apps/web/components/ui/Eyebrow.tsx` — mono uppercase label
- `apps/web/components/ui/Card.tsx` — with `variant` prop (`default` / `warm` / `dark` / `brand`)
- `apps/web/components/ui/Button.tsx` — primary dark pill, outline pill, ghost
- `apps/web/components/ui/SectionShell.tsx` — wraps `max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(80px,12vw,160px)]`

`Button` already exists; review + extend rather than duplicate.

## Files to touch (estimate)

- `apps/web/app/globals.css` — token rewrite (Step 1)
- `apps/web/app/layout.tsx` — font wiring (Step 1)
- `apps/web/app/page.tsx` — verify section order (Step 3)
- `apps/web/app/brand-kit/page.tsx` — replace (Step 4)
- `apps/web/components/klaro/Nav.tsx`, `Hero.tsx` — replace (Step 2)
- `apps/web/components/klaro/sections/*` — 15 sections updated (Step 3)
- New: `apps/web/components/brand-kit/*` — 10 files (Step 4)
- New: `apps/web/components/ui/Pill.tsx`, `Eyebrow.tsx`, `Card.tsx`, `SectionShell.tsx` (Step 6)
- New: `apps/web/components/klaro/MobileBottomNav.tsx`, `BalanceBreakdown.tsx`, `RouteTimeline.tsx`, `StatusPill.tsx` (Step 5)

## Risks

- Tailwind v4 `@theme inline` syntax is newer; existing `globals.css` already uses it but the token names need a careful renaming pass to avoid breaking existing class usage. Workaround: keep both old and new names alongside for one commit, then remove old names after grep confirms zero usage.
- Inter Tight isn't preloaded by `next/font/google` by default for some weights. Use `display: "swap"` and ship a fallback metric.
- Some existing sections have hard-coded copy with the old `--klaro-blue` semantic name. Grep + rename to `--color-klaro-orange` in one commit.
- The reference's 1440-width hero is generous; at the 1280-max container some elements need a careful re-scale to avoid feeling cramped.

## Visual QA plan

After each step:
1. `pnpm --filter @klaro/web dev` running on `http://localhost:3000`.
2. Re-run `node design-reference/capture-refs.mjs` against the production app (need a second script that captures production instead of references — write it as part of Step 1 polish).
3. Read the production screenshot back with the Read tool and diff against the reference shot for the same scroll position.
4. Fix mismatches that affect rhythm, hierarchy, colour, type. Document any intentional divergence in this file under "Known intentional divergences".

## Known intentional divergences (will grow)

- Nav routes resolve to real product routes (Product → `/`, Trust → `/trust`, Roadmap → `/roadmap`, etc.) where reference left them as dead links.
- Hero side product cards use live testnet data when contracts are deployed, else mock fallback with `[SIMULATED]` badge.
- Pricing section's "Open klaro" target is the dashboard (`/vendor`) for signed-in users, signin for anonymous.
- Footer adds real legal links (privacy, terms, security disclosure) the reference omits.

## Validation checklist

Before declaring a step complete:

- [ ] Production renders without console errors at desktop + mobile
- [ ] Tailwind classes resolve to the brand tokens (no inline hex strings remain)
- [ ] Screenshot diff against the reference for the same viewport + scroll position
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] No prototype-only artefacts (no `__bundler_*`, no iPhone bezels in product code, no hardcoded sample names where real data exists)
- [ ] Reduced-motion preference respected
