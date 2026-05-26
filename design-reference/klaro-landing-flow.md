# Klaro Landing Page Flow

Source: `Klaro Landing offline.html`. Captured screenshots: `design-reference/screenshots/landing-viewport-*.png` (21 viewport shots + full-page).

The production landing at [`apps/web/app/page.tsx`](../apps/web/app/page.tsx) must match this section order and visual rhythm.

## Section map

| # | Section | Source | Component | Target file |
| --- | --- | --- | --- | --- |
| 1 | Sticky nav | `landing-viewport-00.png` | `Nav.tsx` | `apps/web/components/klaro/Nav.tsx` |
| 2 | Hero | `landing-viewport-00.png` (top half) + `01.png` | `Hero.tsx` | `apps/web/components/klaro/Hero.tsx` |
| 3 | "Three steps. One receipt." | `landing-viewport-02.png` | `HowItWorks` | `apps/web/components/klaro/sections/HowItWorks.tsx` |
| 4 | "An Arc-native payment OS" lede | `landing-viewport-02.png` (bottom) + `03.png` | new `PlatformLede` or extend `PlatformOS` | `apps/web/components/klaro/sections/PlatformOS.tsx` |
| 5 | Four surface preview cards | `landing-viewport-03.png` + `04.png` | `PlatformOS` (continued) | same |
| 6 | "Reputation that earns its score" + "StableFX, agents, and what's next" 2-up | `landing-viewport-04.png` | new component split | `sections/Reputation.tsx` + `sections/LabPreview.tsx` |
| 7 | Truth table | `landing-viewport-05-06.png` | `TruthTable.tsx` | `sections/TruthTable.tsx` |
| 8 | "The Stenn-Proof receipt" 2-up (Traditional PDF vs Stenn-Proof) | `landing-viewport-07-08.png` | `StennProof.tsx` | `sections/StennProof.tsx` |
| 9 | "The Stenn collapse" explainer card | `landing-viewport-08.png` (bottom) | `StennProof.tsx` continued | same |
| 10 | "USDC in. Rupees out." Partner Cashout | `landing-viewport-09.png` | `PartnerCashout.tsx` | `sections/PartnerCashout.tsx` |
| 11 | Corridors table | `landing-viewport-10-12.png` | `Corridors.tsx` | `sections/Corridors.tsx` |
| 12 | "One product. Three jobs." Vendor / Buyer / Developer | `landing-viewport-12-13.png` | `ThreeAudiences.tsx` | `sections/ThreeAudiences.tsx` |
| 13 | ERP integrations | `landing-viewport-14.png` | `ErpIntegrations.tsx` | `sections/ErpIntegrations.tsx` |
| 14 | Developers + code snippet | `landing-viewport-15.png` | `Developers.tsx` | `sections/Developers.tsx` |
| 15 | Security pillars | `landing-viewport-16.png` | `Security.tsx` | `sections/Security.tsx` |
| 16 | Metrics band ("Live on Arc testnet") | `landing-viewport-17.png` | `MetricsBand.tsx` | `sections/MetricsBand.tsx` |
| 17 | Pricing 3-up (Testnet / Standard / Scale) | `landing-viewport-18.png` | `Pricing.tsx` | `sections/Pricing.tsx` |
| 18 | Final CTA + footer | `landing-viewport-19-20.png` | `FinalCta.tsx` + `Footer.tsx` | `sections/FinalCta.tsx` + `Footer.tsx` |

## Hero details

- Eyebrow pair: orange dot + "Open testnet · live on Arc" mono pill (warm soft background), plus a second info pill "USDC · EURC · CCTP V2".
- Display headline: `Get paid in seconds. Not weeks.` — `seconds.` painted in `--klaro-blue`.
- Lede: 3-line body in `--muted`.
- CTAs: dark pill `Create your first invoice →` (primary) + outline pill `See a real receipt`.
- Below CTAs: status strip — green dot `All systems operational` · `Free during testnet` · `Arc-native · Circle Wallets` (mono, muted).
- Right side (desktop only): two stacked product cards — a hosted invoice card showing "PAID · 1.4s" status, and a Stenn-Proof receipt card showing the verified-by-hash UI.

## CTA hierarchy

| Context | Primary | Secondary |
| --- | --- | --- |
| Hero | Create your first invoice | See a real receipt |
| Section 4-5 | Tour the Platform OS | (read the truth table) |
| Section 8 | See a Stenn-Proof receipt | (read about the collapse) |
| Pricing | Create account | Contact sales |
| Final CTA | Open klaro | View the receipt |

## Visual rhythm rules

- Every section uses the same horizontal container (`max-width: 1280px`, padding `clamp(20px, 4vw, 56px)`).
- Vertical padding `clamp(80px, 12vw, 160px)` top + bottom — generous, never tight.
- Section transitions are background swaps: `--bg` (white) → `--bg-warm` (cream) → `--bg-dark` (Stenn-Proof comparison, agent lab) → back to `--bg`.
- Each non-hero section opens with a mono eyebrow (orange on light, gold on dark) and a display-weight title.

## Responsive notes

- Desktop ≥ 1024px: full grid layouts as shown.
- Tablet 768-1023px: cards stack to 2-up; hero shrinks display to clamp(40px, 7vw, 64px).
- Mobile < 768px: full single-column. CTAs go full-width. Side product cards in the hero collapse below the headline + CTAs.

## Motion

- Hero CTAs: hover lifts background by one shade, no transform.
- Section reveals: 8px fade-up at 320ms ease-out as section enters viewport, items stagger 60ms.
- Pricing cards: hover raises shadow + 1px border darken.
- No parallax, no scroll-jacking, no marquee.

## Implementation plan

1. Token pass first: ship `globals.css` and `app/theme.css` (if separate) with the full token set from `klaro-brand-system.md`.
2. Replace `Nav.tsx`, `Hero.tsx`, and the 5 first-screen sections to lock the top experience.
3. Sections 6 onwards in order. Each ships standalone — landing remains shippable if a downstream section isn't done yet.
4. Mobile collapse rules applied per section as it lands.
5. Visual QA after each section: re-screenshot at 1440×900 + 390×844 and diff against the reference shots.

## Known intentional divergences

- Real navigation routes resolve where they didn't in the reference (Trust → `/trust`, Pricing → `/pricing`, etc.).
- Hero product-card numbers come from the live testnet, not the static `cl7-d3-m0` / `$4,200.00` references. Reference values are kept as placeholders only when no live data exists.
- Footer adds legal links the reference omits (privacy, terms, security disclosure).
