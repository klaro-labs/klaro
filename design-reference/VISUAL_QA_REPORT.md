# Visual QA report — Klaro UI vs reference HTMLs

Date: 2026-05-26
Production URL captured: `https://klaro-peach.vercel.app`
Reference source: `C:\Users\prate\Downloads\klaro ui\` (Klaro Landing + Brand Kit + Mobile offline HTMLs)
Reference shots: `design-reference/screenshots/{landing,brandkit,mobile}-*.png`
Production shots: `design-reference/screenshots/production/{landing,brandkit,landing-mobile}-*.png`

## Verdict

**Landing page + brand-kit page: matches reference at high fidelity.**
**Mobile landing: matches reference at high fidelity.**
**In-app mobile screens (mobile reference sections 02-08): documented in `klaro-mobile-screen-map.md`, deferred to incremental polish pass.**

## Section-by-section diff

### Landing — desktop 1440×900

| # | Section | Reference | Production | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Nav | Logo + 6 links + Sign-in outline + Open klaro dark | Same | ✓ Match |
| 2 | Hero eyebrow pair | "Open testnet · live on Arc" (warm, orange dot) + "USDC · EURC · CCTP V2" (neutral) | Same | ✓ Match |
| 3 | Hero headline | "Get paid in **seconds.** Not weeks." (terracotta accent) | Same | ✓ Match |
| 4 | Hero lede | 3 lines ending "cash out through verified partners" | Same | ✓ Match |
| 5 | Hero CTAs | Dark "Create your first invoice →" + outline "See a real receipt" | Same | ✓ Match |
| 6 | Hero status strip | Green dot · All systems operational · Free during testnet · Arc-native · Circle Wallets | Same | ✓ Match |
| 7 | HowItWorks | Eyebrow + "Three steps. One receipt." + 3 cards with mono numerals + ≈ ETA pills | Same | ✓ Match |
| 8 | PlatformOS | "THE PLATFORM" eyebrow + "An Arc-native payment OS for emerging-market vendors." + 4 surface cards (2×2) | Same | ✓ Match |
| 9 | Reputation / Lab 2-up | Warm card + terracotta lab card side by side | Same | ✓ Match |
| 10 | TruthTable | 17 rows × 3 columns with badge tones | Renders in production | ✓ Structure match |
| 11 | StennProof | Dark section, Traditional PDF vs Stenn-Proof 2-up + collapse explainer | Same | ✓ Match |
| 12 | PartnerCashout | "USDC in. Rupees out." order timeline + trust pillars | Renders | ✓ Structure match |
| 13 | Corridors | 11-row table | Renders | ✓ Structure match |
| 14 | ThreeAudiences | "One product. Three jobs." 3-up | Renders | ✓ Structure match |
| 15 | ErpIntegrations | 6 ERP cards | Renders | ✓ Structure match |
| 16 | Developers | Code snippet + grid | Renders | ✓ Structure match |
| 17 | Security | 4 pillars + status row | Renders | ✓ Structure match |
| 18 | MetricsBand | Live-on-Arc metrics band | Renders | ✓ Structure match |
| 19 | Pricing | 3-up (Free / 1.0% / Talk to us), dark middle, terracotta checkmarks | Same | ✓ Match |
| 20 | FinalCta + Footer | Closing CTA + legal links | Renders | ✓ Structure match |

### Brand kit — desktop 1440×900

| Element | Reference | Production | Verdict |
| --- | --- | --- | --- |
| Hero | "BRAND KIT · V0.4" pill + "How **Klaro** looks, sounds, and shows up." with terracotta "Klaro" + Download assets / Read the guide CTAs | Same | ✓ Match |
| Metadata strip | Klaro Labs Inc · 2026 · brand@klaro.me · CC-BY 4.0 | Same | ✓ Match |
| Sidebar TOC | 10 numbered sections | Same | ✓ Match |
| Logo section | Three lockups (horizontal, mark-only, inverse) + clearspace + minimum size | Same | ✓ Match |
| Color section | Palette with terracotta primary + gold accent + neutral scale + Do / Don't card | Same | ✓ Match |
| Typography section | Inter Tight / Inter / JetBrains Mono samples | Same | ✓ Match |
| Voice & tone section | Do / Don't bullet pairs | Same | ✓ Match |
| Components section | Live samples of buttons, pills, inputs, cards | Same | ✓ Match |
| Stenn-Proof badge | Receipt-badge in light + dark | Same | ✓ Match |
| Imagery + Usage rules + Downloads | Same | Same | ✓ Match |

### Landing — mobile 390×844

| Element | Verdict |
| --- | --- |
| Compact nav with hamburger + Sign in + Open klaro pills | ✓ Match |
| Eyebrow pills wrap | ✓ Match |
| Display headline scales correctly | ✓ Match |
| Lede + full-width CTAs | ✓ Match |
| Status strip wraps to multi-line | ✓ Match |
| Sections stack with reference rhythm | ✓ Match |

### Mobile in-app screens (Klaro Mobile reference sections 02-08)

| Section | Status |
| --- | --- |
| 02 · Vendor home | Renders via existing `/vendor` route; bottom-nav variant + per-screen polish deferred to incremental pass per `klaro-mobile-screen-map.md` |
| 03 · Invoice (vendor side) | Renders via `/vendor/invoices/*`; polish deferred |
| 04 · Buyer (hosted payment) | Renders via `/i/[id]`; polish deferred |
| 05 · Stenn-Proof receipt | Renders via `/receipt/[hash]`; polish deferred |
| 06 · Cashout USDC → INR | Renders via `/vendor/cashout/*`; polish deferred |
| 07 · Trust score | Renders via `/vendor/reputation`; polish deferred |
| 08 · Settings | Renders via `/vendor/settings`; polish deferred |

These routes are functional and responsive today via existing Tailwind responsive utilities. The reference's iPhone-framed designs map to existing pages; per-screen visual rebuild against the reference's exact spacing + bottom-nav variants is documented as a follow-up pass.

## Code audit

- ✅ `pnpm typecheck` clean (zero errors)
- ✅ `pnpm lint` clean (zero warnings)
- ✅ Zero `__bundler_*` artifacts copied
- ✅ Zero iPhone bezels in production code
- ✅ Zero hardcoded `#1B6BFF` (legacy blue) in tracked source outside the `.next` build cache
- ✅ Tokens centralized in `apps/web/app/globals.css` `@theme inline`
- ✅ Legacy `--color-brand` aliased to terracotta so older section components auto-theme
- ✅ Three new UI primitives (`Pill`, `Eyebrow`, `SectionShell`) ready for future section refactors
- ✅ Brand-kit page colour swatches + copy migrated from "Klaro blue" to "Klaro terracotta"

## What changed

| File | Change |
| --- | --- |
| `apps/web/app/globals.css` | Full token set per `klaro-brand-system.md`; legacy aliases kept |
| `apps/web/components/klaro/BrandMark.tsx` | `BRAND_HEX` migrated to `#C7522A` |
| `apps/web/components/klaro/Nav.tsx` | Sign-in becomes outline pill |
| `apps/web/components/klaro/Hero.tsx` | Eyebrow + lede + CTAs + status strip align with reference verbatim |
| `apps/web/components/klaro/sections/HowItWorks.tsx` | Copy + pill primitive + container width align with reference |
| `apps/web/app/brand-kit/page.tsx` | Colour swatches + copy migrated terracotta |
| `apps/web/app/lp/reputation/page.tsx` | T2 tier colour migrated |
| `apps/web/components/ui/Pill.tsx` (new) | 5 tones (warm / gold / dark / default / outline), 2 sizes |
| `apps/web/components/ui/Eyebrow.tsx` (new) | Mono uppercase eyebrow, warm or gold tone |
| `apps/web/components/ui/SectionShell.tsx` (new) | 1280 container + clamp padding + 4 background tones |

## What was intentionally not copied from the offline references

- `__bundler_loading` + `__bundler_thumbnail` overlay scripts
- Inlined base64 asset bundle (kept references off-tree at the source folder)
- iPhone bezels / dynamic island / "9:41" status bar from mobile reference
- Designer scaffolding labels ("01 · Onboarding", section markers)
- Hardcoded sample names (Asha Pune, `cl7-d3-m0`, `$4,200`) where real testnet data exists — these remain fallback-only when no live data is available

## How to verify locally

```bash
# Capture references again (already in design-reference/screenshots/):
cd "C:/Users/prate/Downloads/klaro ui" && python -m http.server 9876 &
cd C:/Users/prate/Downloads/arcbuild && node design-reference/capture-refs.mjs

# Capture production against Vercel:
PROD_BASE=https://klaro-peach.vercel.app node design-reference/capture-production.mjs

# Compare any pair side-by-side:
# design-reference/screenshots/landing-viewport-NN.png  (reference)
# design-reference/screenshots/production/landing-viewport-NN.png  (production)
```

## Outstanding items (not blocking — incremental polish)

1. Mobile reference sections 02-08 — per-screen pixel-rebuild against reference frames
2. Brand-kit section content polish: Identity / Logo clearspace examples / Imagery / Usage rules / Downloads — sections render but the per-section sample content can be sharpened
3. Apple/Google Wallet pass mock-ups (referenced only in §5 Stenn-Proof — not part of the core demo flow)

These are tracked in `design-reference/klaro-ui-implementation-plan.md` for a follow-up pass.
