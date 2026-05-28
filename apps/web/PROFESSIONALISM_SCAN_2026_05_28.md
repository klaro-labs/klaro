# Professionalism scan — 2026-05-28

Cross-cutting read-only audit of `apps/web/app/`, `apps/web/components/`, `apps/web/lib/` for the violations in `internal/CLAUDE.md` and `internal/LOVABLE_PORT_PLAN.md` §1.

## Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 7 |
| P2 | 14 |
| **Total** | **21** |

### What was scanned and found clean (zero findings)

- `// @ts-nocheck` — 0 occurrences anywhere in `apps/web`.
- `alert(` in production code — 0 live calls (only test strings, a route comment, and a removed-control comment in `BulkImportClient.tsx:86`).
- `console.log(` in production code — 0 live calls. `developers/page.tsx:30,62` and `components/klaro/sections/Developers.tsx:29` are inside backtick code-sample strings (rendered as syntax-highlighted docs, not executed). `lib/email.ts:69` is fenced behind `if (process.env.NODE_ENV !== "production")` with prod failing closed. `scripts/seed.ts` is a CLI script.
- Lovable watermark mentions — 0 (no `Lovable`, `Built with`, `Hosted on`).
- Fake vendor/customer names from prototype — `Atelier Vega`, `Hokusai`, `Hokusai Studios` — 0 in `apps/web`.
- Fake office addresses — `138 Market St`, `WeWork Galaxy`, `Residency Rd` — 0.
- Placeholder emails `[email protected]`, `klaro.example`, `@klaro.example` — 0.
- Mock invoice number `KL-2026-0042` — 0.
- Mock receipt/tx artefacts `rcpt_01`, `0x7f3a…be21`, `4,812,904`, `0x8a2f…91d4` — 0.
- "Trusted by N teams" / "10,000+ developers" / "1,000+ vendors" — 0 (the `10,000+` hit on `/product/reputation` is a reputation tier threshold, not a user-count claim).
- "Lorem ipsum" / "FIXME" / "TODO" / "XXX" — 0.
- Filler openers / hedging mush / empty wrap-ups (`Let me`, `I'll help you`, `It's worth noting`, `Hope this helps`, `Feel free to`, `As you may know`) — 0.
- Dead `href="#"` anchors — 0. The 5 hits all resolve to real same-page section IDs (`brand-kit:73,79` → `#downloads`/`#identity` exist at `:1053`/`:193`; `vendor/disputes/[caseId]:128` → `#add-evidence` exists at `:181`; `brand-kit:142` and `admin/page.tsx:119` are dynamic TOC anchors).
- AI-slop adjectives (`comprehensive`, `robust`, `powerful`, `seamless`, `leverage`, `utilize`, `delve`) in active copy — 0. The two hits in `brand-kit/page.tsx:538-545` are inside `DoDontPair` "DON'T" example strings teaching writers to avoid that language. Same for `best-in-class`, `industry-leading`, `next generation` at `:528-544`.
- Emoji in active user copy — 0 meaningful (only ✓/✕/→/+/◉/✦ as typographic check/cross/arrow marks). The `📄 💳 🛡 🔒 🌐 🕐 🔑` cluster at `brand-kit/page.tsx:687-698` is inside an "Iconography" reference grid demonstrating tokens, not active copy.
- Hardcoded font-family strings in `.tsx` outside `globals.css` — only inside `app/global-error.tsx` (system-font fallback for root error boundary, no React/CSS-in-JS available) and `app/opengraph-image.tsx` (Next.js `ImageResponse` requires inline). Acceptable.

---

## P0 — must fix before launch

(none)

---

## P1 — professionalism + voice

### [P1] Coming-soon placeholder copy in user-facing surfaces
Banned per LOVABLE_PORT_PLAN §1 and principle 3 ("no `Coming soon`"). Some are intentionally honest "Ships M9" labels, others read as filler.

- **File**: `apps/web/app/help/page.tsx:86`
  - **Match**: `placeholder="Search Klaro help (coming soon)"`
  - **Fix**: remove placeholder or wire a real search; per principle 3 a non-functional search input is worse than no input.

- **File**: `apps/web/app/brand-kit/page.tsx:1119`
  - **Match**: `title="Asset bundles coming soon"`
  - **Fix**: either ship the zip in `public/brand/*.zip` or remove the card per LOVABLE_PORT_PLAN §3.12 ("today they `href="#"`").

- **File**: `apps/web/app/lp/settings/page.tsx:97,108,111,134`
  - **Match**: `<Badge tone="warn">Coming soon</Badge>` · `"Coming soon" badge so the LP doesn't believe a click persists.` · `Notification preferences are coming soon` · second `Coming soon` badge
  - **Fix**: per principle 3, hide the toggles entirely until the LP-notifications worker lands, or label `Ships M-N` with a clear next step.

- **File**: `apps/web/app/vendor/bills/page.tsx:31`
  - **Match**: `<Badge tone="sim">Coming soon</Badge>`
  - **Fix**: replace with milestone label per principle 8 (`Ships M-N`, `partner-pending`).

- **File**: `apps/web/app/vendor/financing/page.tsx:135`
  - **Match**: `Download PDF preview · coming soon`
  - **Fix**: hide CTA until export wired, or label `Ships M-N`.

- **File**: `apps/web/app/vendor/agents/page.tsx:61,67`
  - **Match**: `Agent jobs · coming soon` · `AgentEscrow wiring and per-job persistence are coming soon`
  - **Fix**: relabel with milestone (`Ships M11`) or hide the surface entirely until live.

### [P1] Throat-clearing section title "Overview"
Banned per CLAUDE.md L17 ("Section titles like 'Overview' / 'Summary' / 'Conclusion' stapled onto short content").

- **File**: `apps/web/app/vendor/page.tsx:191`
  - **Match**: `Overview`
  - **Fix**: replace with a content-bearing label or remove the eyebrow.

### [P1] Demo email in code-sample placeholder
LOVABLE_PORT_PLAN §1 bans placeholder customer/vendor identifiers leaking into production surfaces.

- **File**: `apps/web/components/klaro/sections/Developers.tsx:22`
  - **Match**: `customer: { email: "client@nyc-saas.demo" }`
  - **Fix**: switch to a clearly-illustrative literal like `customer@yourdomain.com` to avoid implying a real demo tenant.

---

## P2 — design consistency

### [P2] Brand-token migration: `--color-brand` → `--color-klaro-orange`
LOVABLE_PORT_PLAN §0 hard rule 7: "switch every reference to our orange tokens." Both tokens currently resolve to `#C7522A` (defined at `globals.css:46` and `:12` respectively), so behavior is identical, but the legacy `--color-brand`/`--color-brand-soft` name should be migrated.

- **Scope**: ~210 occurrences across 60+ files (full list in tool output; representative files below).
- **Representative files**: `components/ui/Button.tsx:14`, `components/ui/Badge.tsx:19`, `components/ui/Input.tsx:20`, `components/klaro/Hero.tsx:37,121`, `components/klaro/SectionHeader.tsx:33`, `components/klaro/sections/{Corridors,TruthTable,PlatformOS,ThreeAudiences,PartnerCashout,Security,FinalCta,Pricing}.tsx`, all `app/vendor/*`, `app/lp/*`, `app/admin/*`, `app/legal/*`, `app/i/[id]/page.tsx`, `app/receipt/[hash]/page.tsx`, `app/brand-kit/page.tsx`, `app/company/page.tsx`, `app/docs/page.tsx`, `app/developers/page.tsx`, `app/help/page.tsx`, `app/fx/*`, `app/agents/*`, `app/roadmap/page.tsx:15`.
- **Fix**: codemod replace `--color-brand` → `--color-klaro-orange` and `--color-brand-soft` → `--color-klaro-orange-soft` in all `.tsx`. Then remove the legacy alias from `globals.css:46-47`. Single PR.

### [P2] Hardcoded hex colours in `.tsx` outside `globals.css`

- **File**: `apps/web/components/klaro/BrandMark.tsx:14-15`
  - **Match**: `export const INK_HEX = "#0A0A0A"; export const BRAND_HEX = "#C7522A";`
  - **Fix**: derive from `var(--color-ink)` / `var(--color-klaro-orange)` via `getComputedStyle`, or accept that these power SVG fills passed to non-CSS consumers and promote to a typed `tokens.ts` module.

- **File**: `apps/web/components/klaro/sections/Developers.tsx:89-90`
  - **Match**: `bg-[#0F0F12]` · `bg-[#16161A]`
  - **Fix**: add `--color-code-bg` / `--color-code-chrome` tokens to `globals.css`.

- **File**: `apps/web/components/klaro/sections/FinalCta.tsx:88`
  - **Match**: `bg-[#0F0F12]`
  - **Fix**: same as above — use the new code-bg token.

- **File**: `apps/web/app/brand-kit/page.tsx:300,331-345,359-363,881`
  - **Match**: literals `#C7522A`, `#F5B100`, `#ffffff`, `#0A0A0A`, `#6B6B6B`, `#A3A3A3`, `#E5E5E5`, `#FAFAF7`, `#f6c200`, `#00E5FF`
  - **Fix**: most are intentional swatch-display literals (the page IS the colour spec), but the gradient at `:881` and the rendered swatches should derive their colour from token constants imported from `tokens.ts` so the swatch list and the actual tokens can never drift.

- **File**: `apps/web/app/lp/reputation/page.tsx:16,23,30`
  - **Match**: `color: "#7280A0"` · `color: "#C7522A"` · `color: "#F5B100"`
  - **Fix**: replace with `var(--color-ink-muted)`, `var(--color-klaro-orange)`, `var(--color-klaro-gold)`; lift tier styling into CVA variants.

- **File**: `apps/web/app/roadmap/page.tsx:16,17,18`
  - **Match**: `color: "#F5B100"` · `color: "#7280A0"` · `color: "#C0C5D0"`
  - **Fix**: replace with `var(--color-klaro-gold)` / `var(--color-ink-muted)` / new `--color-ink-faint` token.

- **File**: `apps/web/app/vendor/settings/page.tsx:15,142`
  - **Match**: fallback `"#1B6BFF"` and placeholder `"#1B6BFF"`
  - **Fix**: this is a per-vendor brand colour (legitimate user input), but the default fallback should be `var(--color-klaro-orange)` not a stray Lovable-era blue.

- **File**: `apps/web/app/icon.tsx:17`, `apps/web/app/icon0.tsx:15`, `apps/web/app/icon1.tsx:15`, `apps/web/app/apple-icon.tsx:17`
  - **Match**: `background: "#FAFAF7"`
  - **Fix**: Next `ImageResponse` requires inline hex (no CSS vars at edge runtime). Acceptable; pull from a shared `OG_COLORS` constant so all four favicons stay in sync.

- **File**: `apps/web/app/opengraph-image.tsx:13,40,54,64,79,80`
  - **Match**: multiple inline `color: "#0A0A0A"`, `color: "#444"`, `#666`, `#D0D5DD`, gradient `#FAFAF7 → #EAF1FF`
  - **Fix**: same as favicons — `ImageResponse` constraint, but consolidate into `OG_COLORS` const. The `#EAF1FF` cool-blue accent does not match Klaro warm-orange brand — replace with a tone derived from `--color-klaro-orange-soft`.

- **File**: `apps/web/app/global-error.tsx:27,28,39,52,66,78,79`
  - **Match**: 7 inline hex colours
  - **Fix**: root error boundary runs before CSS loads, so inline is required; but `#8a8a87` and `#525252` are not in the token system — align to `#6B6B6B`/`#A3A3A3` from `globals.css`.

### [P2] Hardcoded font-family strings in `.tsx`

- **File**: `apps/web/app/global-error.tsx:26,64`
  - **Match**: `fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"` · `fontFamily: "monospace"`
  - **Fix**: root error boundary — acceptable. Consider a constant.

- **File**: `apps/web/app/opengraph-image.tsx:20`
  - **Match**: `fontFamily: "system-ui, sans-serif"`
  - **Fix**: load the actual Klaro display font via `fetch` + `ImageResponse({ fonts })` so OG cards match the site typography. Current OG card uses generic system font — brand inconsistency.

### [P2] Hardcoded magic dimensions outside the klaro-* token system

- **File**: `apps/web/components/klaro/Hero.tsx:20`
  - **Match**: `h-[760px] w-[760px] rounded-full ... blur-[160px]`
  - **Fix**: these are deliberate decorative blobs but the magic 760/160 numbers should live as named CSS vars (`--klaro-hero-orb-size`) so other heroes stay consistent.

- **File**: `apps/web/app/signin/page.tsx:79`
  - **Match**: `h-[640px] w-[640px] ... blur-[140px]`
  - **Fix**: same — promote to `--klaro-signin-orb-*` tokens.

### [P2] Inconsistent token name still defined in `globals.css`

- **File**: `apps/web/app/globals.css:46-48`
  - **Match**: `--color-brand: #C7522A; --color-brand-soft: #FAEDE5; --color-gold: #F5B100;`
  - **Fix**: these legacy aliases duplicate `--color-klaro-orange` / `--color-klaro-orange-soft` / `--color-klaro-gold`. Comment at L9 explicitly says new code uses the klaro-prefixed name. Delete after the migration codemod (linked to the P2 token migration above).

---

## Executive summary

The codebase **passes the P0 launch bar today**: zero `@ts-nocheck`, zero live `alert(`, zero live `console.log` in app code, zero Lovable watermarks, zero fabricated vendors/offices/emails/invoice-numbers from the prototype, zero dead `href="#"` anchors, zero AI-slop phrases in active copy, zero filler/hedging/empty-wrapups, zero "Lorem ipsum" — the LOVABLE_PORT_PLAN §1 ban list has been honored thoroughly.

The 21 remaining findings are split between P1 honesty drift (7 "Coming soon" placeholders on `/help`, `/brand-kit`, `/lp/settings`, `/vendor/{bills,financing,agents}`, plus one `Overview` throat-clear on `/vendor` and one demo email literal in the Developers code sample) and P2 design-consistency hygiene (~210 instances of legacy `--color-brand` token that should migrate to `--color-klaro-orange`, plus a handful of hardcoded hex colours in `lp/reputation`, `roadmap`, `Developers`, `FinalCta`, `BrandMark`, OG/favicon image routes, and `vendor/settings` brand-colour fallback).

None of the P1/P2 findings blocks a public launch on their own; together they are a half-day of cleanup. The big move is the `--color-brand` → `--color-klaro-orange` codemod plus removing the legacy alias from `globals.css:46-48`. After that and the seven Coming-soon copy fixes, this surface is launch-grade.

Report file: `apps/web/PROFESSIONALISM_SCAN_2026_05_28.md`.
