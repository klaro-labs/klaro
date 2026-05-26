# Klaro Brand System

Extracted from `Klaro Brand Kit offline.html` (v0.4 working draft, 2026-05-19). These tokens are the single source of truth for visual style across the product.

## Color tokens

### Brand

| Token | Hex | Use |
| --- | --- | --- |
| `--klaro-blue` | `#C7522A` | Primary brand colour (terracotta — name kept for code stability, the colour is warm orange). Headline accent word, link hover, badge fills. |
| `--klaro-blue-deep` | `#8E3414` | Hover / active state of brand. Inline error tints. |
| `--klaro-blue-soft` | `#FAEDE5` | Brand-tinted surface (pill backgrounds, cards). |
| `--klaro-gold` | `#F5B100` | Status: verified, live, ready. Stenn-Proof receipt highlight. |
| `--klaro-gold-soft` | `#FFF6DD` | Gold-tinted surface (status pills, success rails). |

### Ink (foreground)

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#0A0A0A` | Body text, primary headings. |
| `--ink-2` | `#1A1A1A` | Subheadings, button text on light. |
| `--ink-3` | `#2E2E2E` | Secondary headings, contrast badges. |
| `--muted` | `#6B6B6B` | Body sub-text, captions. |
| `--muted-2` | `#8A8A8A` | Placeholder, disabled, meta. |

### Lines + surfaces

| Token | Value | Use |
| --- | --- | --- |
| `--line` | `rgba(10, 10, 10, 0.08)` | Default border, card edge. |
| `--line-2` | `rgba(10, 10, 10, 0.14)` | Active border, focus ring inner. |
| `--bg` | `#FFFFFF` | Default paper. |
| `--bg-warm` | `#FAFAF7` | Warm paper for hero, cards, scrolled sections. |
| `--bg-cool` | `#F4F6FA` | Cool paper for FX surfaces, dev callouts. |
| `--bg-dark` | `#0A0A0A` | Dark sections, primary CTA fill. |
| `--bg-dark-2` | `#131313` | Dark card surface inside `--bg-dark` sections. |

## Typography

Three families. Loaded from Google Fonts.

| Token | Family | Use |
| --- | --- | --- |
| `--display` | `"Inter Tight", "Inter", system` | Display: hero, section titles. Letter-spacing `-0.04em` at heavy weights. |
| `--body` | `"Inter", system` | Body, UI. |
| `--mono` | `"JetBrains Mono", "SF Mono", Menlo, monospace` | Receipts, code, hashes, addresses, badges, eyebrow labels, tabular data. |

### Type scale (display)

- Hero: clamp(48px, 6vw, 96px), weight 600, line-height 0.95, tracking -0.04em
- Section title: clamp(36px, 5vw, 64px), weight 600, tracking -0.03em
- Subsection: clamp(22px, 2.4vw, 32px), weight 600

### Type scale (body)

- Large lede: clamp(17px, 1.2vw, 19px), weight 400, line-height 1.55
- Body: 16px, weight 400, line-height 1.55
- Small: 14px, weight 400
- Caption: 13px, weight 500
- Eyebrow / pill (mono): 12px, weight 500, letter-spacing 0.04em, uppercase

## Spacing

| Token | Value |
| --- | --- |
| `--pad` | `clamp(20px, 4vw, 56px)` (section horizontal padding) |
| `--max` | `1280px` (container max width) |
| Section vertical padding | `clamp(80px, 12vw, 160px)` top, similar bottom |
| Card padding | 24-32px |
| Stack rhythm | 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px |

## Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | `8px` | Pills, mono badges, inline buttons. |
| `--radius` | `14px` | Default card, input. |
| `--radius-lg` | `22px` | Hero cards, prominent surfaces. |
| `--radius-xl` | `32px` | Page-level cards (lab preview, pricing). |
| Full pill | `9999px` | CTA buttons, nav signin pill, status pills. |

## Borders

- Default: `1px solid var(--line)`.
- Active / focused: `1px solid var(--line-2)`.
- Inverse (on dark): `1px solid rgba(255,255,255,0.10)`.

## Shadows

The system is mostly flat. Two shadows in active use:

- `--shadow-card`: `0 1px 0 rgba(10,10,10,0.04), 0 4px 16px rgba(10,10,10,0.04)` — default card lift.
- `--shadow-cta`: `0 1px 2px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.20)` — only on the dark primary CTA when on light surface.

No glassmorphism, no neon, no purple, no gradients (the brand kit's "DON'T" section explicitly rejects blue-to-purple gradients).

## Logo

- Symbol: chunky orange `K` arrow that resolves into a left-pointing chevron at the stem.
- Wordmark: `klaro` lowercase, weight 500, in `--ink`.
- Clearspace: height of the K-stem on all sides.
- Minimum sizes:
  - 16px mark, 14px wordmark.
  - Below that, mark only.
- Inverse: white wordmark on ink-black pill.

## Buttons

### Primary (dark pill)

- Background: `--bg-dark`
- Text: white
- Padding: 12px 20px
- Radius: 9999px
- Trailing `→` arrow with 6px left margin
- Hover: background lifts to `#1A1A1A`, no transform
- Active: `transform: translateY(1px)`

### Secondary (outline pill)

- Background: transparent
- Border: `1px solid var(--line-2)`
- Text: `--ink`
- Same padding + radius

### Ghost

- No border, text only
- Hover: underline OR `--klaro-blue` shift

## Inputs

- Background: white
- Border: `1px solid var(--line)`
- Radius: `--radius` (14px)
- Padding: 12px 16px
- Placeholder: `--muted-2`
- Focus: border `--ink`, no glow ring

## Cards

- Background: `--bg` (or `--bg-warm` when nested in a dark or warm section)
- Border: `1px solid var(--line)`
- Radius: `--radius-lg` (22px)
- Padding: 24px (mobile) / 32px (desktop)

Heavy variants:
- Dark card: bg `--bg-dark-2`, border `rgba(255,255,255,0.10)`, text white.
- Brand card: bg `--klaro-blue`, text white (used for "StableFX, agents, and what's next.").

## Pill / badge

- Background: `--klaro-blue-soft` (brand) or `--klaro-gold-soft` (verified) or `--bg-warm` (default).
- Border: `1px solid var(--line)`.
- Radius: 9999px.
- Padding: 4px 12px.
- Mono font, 11-12px, uppercase, tracking 0.04em.
- Optional leading dot.

## Eyebrow / section label

- Mono, 12px, weight 500, uppercase, tracking 0.04em
- Colour: `--klaro-blue` for warm sections, `--klaro-gold` for dark sections
- Always sits above the section title with 12-16px gap

## Navigation

- Sticky top, white background with `0.6` opacity backdrop blur of 20px when scrolled.
- Height 64px.
- Left: logo + wordmark.
- Centre: links in `--ink` 15px / weight 500.
- Right: Sign-in pill (outline) + Open klaro pill (dark with arrow).

## Mobile

- Container width: 100%, padding 16-20px sides.
- Headline scale: clamp(28px, 8vw, 40px).
- Bottom-nav inspired patterns for the mobile PWA — see [`klaro-mobile-screen-map.md`](klaro-mobile-screen-map.md).
- Tap target minimum: 44px.

## Icons

- Stroke width 1.75px (Lucide React's default 2px stepped down for elegance).
- Size: 16px (inline), 20px (button-prefix), 24px (card heading), 32px (large feature).
- Always inherits `currentColor`.
- Status icons can use brand colours: green for live, orange-dot for testnet, gold for verified.

## Motion

- Easing default: `cubic-bezier(0.32, 0.72, 0, 1)` (Apple-feel ease-out).
- Durations:
  - Micro: 120ms (button hover, badge state)
  - Small: 200ms (focus ring, link colour)
  - Medium: 320ms (modal, sheet, card hover)
  - Large: 480ms (page transition, scroll-reveal)
- No bounce / spring overshoots.
- Scroll-reveals: fade-up 8px, 320ms, staggered 60ms per item.

## Voice + tone

- Specific. Numbers over adjectives.
- One claim per sentence.
- Confident. No "we believe", "we think", "perhaps".
- Honest mode labels: `live testnet`, `simulated`, `access-gated`, `partner-pending`, `mainnet-only`.
- Plain English over jargon. "Payment is moving to Arc" over "CCTP burn pending attestation".

## Accessibility

- Body contrast minimum WCAG AA (`--ink` on `--bg` = 19.6:1; `--muted` on `--bg` = 4.96:1).
- Focus rings: `2px solid var(--ink)` outline, `2px offset`, no removal.
- Touch targets `>=44px`.
- Reduced-motion: disable scroll-reveals + transform animations when `prefers-reduced-motion: reduce` is set.

## Do / Don't (from brand kit §03)

| Do | Don't |
| --- | --- |
| Solid colour blocks. Tonal neutrals. Generous whitespace. | No gradients. No neon. No purple. No "crypto-bro palettes". |
| Mono for receipts, code, hashes. | Don't mix mono and display fonts inside the same line. |
| Honest mode labels on every surface. | No overclaiming. No "the best", "the fastest", "the only". |
