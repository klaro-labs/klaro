# D11 — Design & Accessibility Audit

**Auditor:** d11_design (senior product designer + accessibility specialist)
**Date:** 2026-05-31
**Scope:** `apps/web/components/**`, `apps/web/app/**` — pages, layouts, forms, navigation
**Method:** Manual code review of globals.css tokens, component source, page source. No runtime testing.

---

## Executive Summary

The Klaro UI is well-structured overall: semantic HTML is used in most places, color tokens have been intentionally darkened for WCAG AA compliance (documented in globals.css comments), and the design system is consistent. However, several medium-to-high severity issues remain:

1. **Brand token drift** between `klaro-tokens.json` (source of truth for external consumers) and `globals.css` (runtime source of truth) — the JSON still ships the pre-fix `#C7522A` and `#A3A3A3` values that fail WCAG AA.
2. **Forms lack inline per-field validation** — all forms rely on a single error banner after submission; no real-time feedback on individual fields.
3. **MegaMenu is hover-only on desktop** — no keyboard trigger to open the dropdown panel; Tab skips past it.
4. **Missing `<h1>` skip-link** — no skip-to-content link anywhere in the app.
5. **Gold token `#F5B100` on white** fails WCAG AA (3.1:1) and is used in the `klaro-eyebrow-on-dark` class name but also in the `--color-warning` adjacent contexts.

---

## Findings

### [HIGH] Brand token JSON ships failing contrast values

- file: `apps/web/public/brand/klaro-tokens.json:4`
- lens: a11y / brand-kit consistency
- what: The distributed token file declares `"terracotta": "#C7522A"` and `"ink-subtle": "#A3A3A3"`. These are the OLD values that fail WCAG AA (4.41:1 and ~2.3:1 respectively). The runtime `globals.css` has already been fixed to `#BC4C26` and `#707070`, but the public JSON (consumed by partners, embed users, docs) still ships the non-compliant originals.
- why: External consumers (receipt-badge, invoice-embed, third-party integrations) pulling from `klaro-tokens.json` will render text that fails AA contrast on white backgrounds.
- fix: Update `klaro-tokens.json` to match the corrected values in `globals.css`: terracotta → `#BC4C26`, ink-subtle → `#707070`. Add a `$description` noting the AA-compliance adjustment.
- confidence: high

### [HIGH] No skip-to-content link

- file: `apps/web/app/layout.tsx:82` (body tag)
- lens: a11y / keyboard nav
- what: The root layout renders `<body>` with no skip-navigation link. Keyboard users must Tab through the entire Nav (8+ links + mega-menu triggers) before reaching page content.
- why: WCAG 2.4.1 (Bypass Blocks) requires a mechanism to skip repeated navigation. Screen-reader and keyboard-only users are penalized on every page load.
- fix: Add a visually-hidden skip link as the first child of `<body>`: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to content</a>` and add `id="main-content"` to the `<main>` element on each page (or in a shared wrapper).
- confidence: high

### [HIGH] MegaMenu not keyboard-accessible

- file: `apps/web/components/klaro/Nav/MegaMenu.tsx:42-50`
- lens: a11y / keyboard nav
- what: The mega-menu panel opens only on `onMouseEnter` and closes on `onMouseLeave`. There is no `onFocus`/`onBlur` handler, no `aria-haspopup`, and no arrow-key navigation within the panel. Keyboard users tabbing through the nav will never see the dropdown items (Invoicing, Receipts, Cashout, etc.).
- why: WCAG 2.1.1 (Keyboard) — all functionality must be operable via keyboard. The menu items inside the panel are unreachable without a mouse.
- fix: Add `onFocus={enter}` and `onBlur` (with relatedTarget check) to the trigger wrapper. Add `aria-haspopup="true"` and `aria-expanded={open}` to the trigger link. Implement arrow-key navigation within the panel items using `roving tabindex` or `aria-activedescendant`.
- confidence: high

### [MEDIUM] Forms lack inline per-field validation feedback

- file: `apps/web/components/klaro/InvoiceForm.tsx:35-90`
- file: `apps/web/components/klaro/LinkForm.tsx:60-70`
- file: `apps/web/components/klaro/CashoutRequestForm.tsx:80-100`
- file: `apps/web/app/onboarding/page.tsx:100-105`
- file: `apps/web/app/company/contact/ContactForm.tsx:50-95`
- lens: design / a11y
- what: All forms display a single error message after submission failure. No individual field shows inline validation (red border, helper text, `aria-invalid`, `aria-describedby`). The onboarding form's `canAdvance()` silently blocks without highlighting which field is incomplete.
- why: Users (especially screen-reader users) cannot identify which specific field needs correction. WCAG 3.3.1 (Error Identification) requires errors to be identified at the item level. Sighted users also lose time scanning for the problem.
- fix: For each required field: (1) add `aria-invalid={true}` when validation fails, (2) render a `<p id="field-error-{name}" role="alert">` below the input with the specific error, (3) add `aria-describedby="field-error-{name}"` to the input. Show red ring on the input border.
- confidence: high

### [MEDIUM] `--color-klaro-gold` (#F5B100) fails AA on white

- file: `apps/web/app/globals.css:18`
- lens: a11y / color contrast
- what: `--color-klaro-gold: #F5B100` has a contrast ratio of ~3.1:1 against `#FFFFFF`. It's used in `.klaro-eyebrow-on-dark` (which is fine — gold on dark bg passes), but the token is also available for general use. The `--color-warning: #F59E0B` (amber-500) is similarly ~3.0:1 on white.
- why: If any component uses `--color-klaro-gold` or `--color-warning` as text color on a white/light surface, it will fail WCAG AA (4.5:1 for normal text). The `--color-gold-deep: #7a5a00` exists but isn't consistently used as the text-on-light variant.
- fix: Add a comment/lint rule that `--color-klaro-gold` and `--color-warning` are background/icon-only tokens on light surfaces. For text, enforce `--color-klaro-gold-deep` or `--color-gold-deep`. Consider renaming or adding a `--color-warning-text` alias at 4.5:1+.
- confidence: high

### [MEDIUM] `klaro-tokens.css` ships stale `--klaro-ink-subtle: #a3a3a3`

- file: `apps/web/public/brand/klaro-tokens.css:14`
- lens: a11y / brand-kit consistency
- what: The public CSS token file declares `--klaro-ink-subtle: #a3a3a3` which is ~2.3:1 on white — fails WCAG AA. The runtime `globals.css` has already been fixed to `#707070`.
- why: Same as the JSON finding — external consumers get a non-compliant value.
- fix: Update to `#707070` to match `globals.css`.
- confidence: high

### [MEDIUM] Contact form uses `noValidate` but provides no custom validation UI

- file: `apps/web/app/company/contact/ContactForm.tsx:60`
- lens: design / a11y
- what: The form element has `noValidate` which disables browser-native validation tooltips, but the component provides NO inline field-level validation. The only feedback is a single `role="alert"` banner after server-side rejection.
- why: With `noValidate`, the browser won't show "Please fill out this field" or email format hints. The user gets zero feedback until they submit and the server responds. This is worse than the default browser behavior.
- fix: Either remove `noValidate` (let the browser provide baseline validation) OR implement full client-side inline validation with `aria-invalid` + per-field error messages.
- confidence: high

### [MEDIUM] InvoiceTable rows not keyboard-focusable

- file: `apps/web/components/klaro/InvoiceTable.tsx:70-95`
- lens: a11y / keyboard nav
- what: Table rows use `<tr>` with a `<Link>` only on the customer name cell. The entire row has a `hover:bg` style suggesting it's clickable, but only the name link is actually interactive. Keyboard users must Tab into each row to find the link — the visual affordance (full-row hover) is misleading.
- why: Discoverability issue for keyboard/screen-reader users. The hover effect implies the row is a single interactive target, but it isn't.
- fix: Either (a) make the entire row a link target using a CSS `::after` pseudo-element stretch pattern, or (b) remove the full-row hover effect and only highlight the link cell, or (c) wrap the `<tr>` content in a single `<Link>` with `display:contents`.
- confidence: medium

### [MEDIUM] Mobile nav sheet lacks focus trap

- file: `apps/web/components/klaro/Nav.tsx:100-145`
- lens: a11y / focus management
- what: The mobile nav sheet is rendered as `role="dialog" aria-modal="true"` but there is no focus trap implementation. When the sheet opens, focus is not moved into it, and Tab can escape behind the overlay to the page content underneath.
- why: `aria-modal="true"` promises assistive tech that focus is contained, but without a JS focus trap, keyboard users can Tab out of the dialog into hidden content. WCAG 2.4.3 (Focus Order).
- fix: On open, move focus to the first interactive element in the sheet. Implement a focus trap (trap Tab/Shift+Tab within the dialog). On close, return focus to the hamburger button.
- confidence: high

### [MEDIUM] CommandPalette items lack `role` and `aria-selected`

- file: `apps/web/components/klaro/CommandPalette.tsx:130-160`
- lens: a11y
- what: The palette renders a list of `<button>` elements for results but doesn't use `role="listbox"` / `role="option"` or `aria-selected` to communicate the active item to screen readers. The input has no `aria-activedescendant` or `aria-controls` linking it to the results list.
- why: Screen-reader users navigating with arrow keys won't hear which item is currently highlighted. WCAG 4.1.2 (Name, Role, Value).
- fix: Add `role="listbox"` to the results container, `role="option"` + `aria-selected={isActive}` + unique `id` to each item, and `aria-activedescendant={activeId}` + `aria-controls="results-list"` to the input.
- confidence: high

### [LOW] Logo component has no accessible text fallback

- file: `apps/web/components/klaro/Logo.tsx:10-18`
- lens: a11y
- what: The Logo renders a `<BrandMark>` SVG + a `<span>klaro</span>`. The SVG itself has no `aria-label` or `role="img"`. When used inside a link with `aria-label="Klaro home"` (as in Nav.tsx:72), this is fine. But when used standalone (e.g., onboarding header at `app/onboarding/page.tsx:119`), the Logo is inside a non-labelled context.
- why: In contexts where the Logo is not wrapped in a labelled link, screen readers will announce the raw "klaro" text span but skip the SVG mark entirely. Minor issue since the text "klaro" is present.
- fix: Add `role="img" aria-label="Klaro"` to the root `<span>` of the Logo component, or ensure every usage is within a labelled container.
- confidence: medium

### [LOW] Onboarding stepper step labels hidden on mobile

- file: `apps/web/app/onboarding/page.tsx:133-140`
- lens: a11y / mobile
- what: Step labels ("Business", "Wallet", "Verification", "First invoice") use `hidden md:inline` — they're invisible on mobile. Only the step numbers (1-4) are shown. The `<ol aria-label="Onboarding progress">` helps, but individual `<li>` elements don't have accessible names beyond the number.
- why: Screen-reader users on mobile get "1, 2, 3, 4" with no semantic meaning. Sighted mobile users see only circles with numbers — no context for what each step covers.
- fix: Add `aria-label={s.label}` to each `<li>` element, or use `<span className="sr-only">{s.label}</span>` inside each step indicator so the label is always available to AT.
- confidence: high

### [LOW] CookieConsent buttons lack explicit `type="button"`

- file: `apps/web/components/klaro/CookieConsent.tsx:52-60`
- lens: a11y
- what: The "Essential only" and "Accept all" buttons use `<button onClick={...}>` without `type="button"`. While they're not inside a `<form>`, best practice is to always specify `type` to prevent accidental form submission if the component is ever nested.
- why: Minor defensive coding issue. No current bug, but fragile.
- fix: Add `type="button"` to both buttons.
- confidence: medium

### [LOW] Hero demo cards are not marked as decorative/presentational

- file: `apps/web/components/klaro/Hero.tsx:80-160`
- lens: a11y
- what: The HeroDemo section renders two mock cards (invoice + receipt) with realistic data ($4,200.00, "Asha Pune", etc.). These are purely decorative/illustrative but are fully readable by screen readers as if they were real interactive content. The "Pay with USDC" div looks like a button but is a `<div>`.
- why: Screen-reader users may be confused by what appears to be an interactive invoice/payment UI that does nothing. The fake "button" divs are not focusable or operable.
- fix: Add `aria-hidden="true"` to the entire `HeroDemo` wrapper, or add `role="presentation"` and ensure no interactive-looking elements are focusable. Add a `<p className="sr-only">` before it: "Decorative preview of the Klaro invoice and receipt experience."
- confidence: high

### [LOW] `prefers-reduced-motion` rule uses `!important`

- file: `apps/web/app/globals.css:82-88`
- lens: design
- what: The reduced-motion media query uses `!important` on `animation-duration`, `transition-duration`, etc. This is a common pattern but can prevent components from opting into safe, non-vestibular animations (e.g., opacity fades) that are acceptable under WCAG 2.3.3.
- why: Overly aggressive — some transitions (opacity, color) are safe for motion-sensitive users and aid comprehension.
- fix: Consider scoping the blanket `!important` to transform/translate-based animations only, or use a more granular approach where individual components can opt out with a `data-safe-motion` attribute.
- confidence: low

### [LOW] Footer link columns collapse to single-column on mobile without clear grouping

- file: `apps/web/components/klaro/Footer.tsx:60-85`
- lens: design / mobile
- what: The footer uses `md:grid-cols-[1.5fr_repeat(4,1fr)]` which collapses to a single column on mobile. The `<h4>` headings for each group are styled as tiny uppercase labels (`text-[11px]`) that can be hard to distinguish from the links themselves on small screens.
- why: On mobile, the footer becomes a very long single-column list where group boundaries are subtle. Users scanning for "Privacy" or "Contact" must scroll through all groups.
- fix: Consider an accordion pattern on mobile (tap heading to expand group), or increase visual separation between groups (larger heading, more spacing, divider lines).
- confidence: medium

### [LOW] Wallet disconnect button has no confirmation

- file: `apps/web/components/klaro/ConnectWalletButton.tsx:48-53`
- lens: design
- what: The "disconnect" text button is tiny (`text-xs`) and positioned right next to the wallet address. One accidental tap disconnects the wallet with no confirmation or undo.
- why: Disconnecting mid-transaction (e.g., during a payment flow) could lose state. The small tap target also fails the 44×44px minimum recommended by WCAG 2.5.5 (Target Size).
- fix: Either add a confirmation step ("Disconnect? [Yes/Cancel]") or make the button larger with adequate spacing. At minimum, ensure the tap target is ≥44px in height.
- confidence: medium

### [LOW] `aria-hidden` input in signin page may confuse password managers

- file: `apps/web/app/signin/page.tsx:100-108`
- lens: a11y
- what: A hidden `<input type="text" name="username" autoComplete="username webauthn" aria-hidden tabIndex={-1} className="sr-only">` is rendered to help password managers. However, `aria-hidden="true"` combined with `tabIndex={-1}` means AT completely ignores it, which is correct — but the `sr-only` class makes it visually hidden while still in the DOM. If a password manager auto-fills it, the value syncs to state but the user has no visual indication.
- why: Edge case — if a password manager fills the hidden field with a different email than what the user types in the visible field, the state could diverge silently.
- fix: Ensure the hidden input's `onChange` always syncs to the visible email field's state (which it does via shared `email` state — this is already handled). Low risk, document the pattern.
- confidence: low

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| HIGH     | 3     |
| MEDIUM   | 6     |
| LOW      | 7     |
| **Total**| **16**|

## Top 5 Priority Fixes

1. **Skip-to-content link** — trivial to add, high impact for keyboard/SR users
2. **MegaMenu keyboard access** — blocks keyboard users from discovering 5 product pages
3. **Mobile nav focus trap** — `aria-modal` contract is broken without it
4. **Inline form validation** — affects every form in the app (5+ components)
5. **Brand token files sync** — external consumers get failing-contrast values

## Notes

- Color contrast in `globals.css` is well-documented and intentionally fixed (LF-4 comments). The runtime tokens pass AA.
- The `prefers-reduced-motion` blanket rule is present and correct.
- Loading states exist (`Skeleton`, `loading.tsx` files in admin/lp routes).
- Error boundaries exist at root (`error.tsx`, `global-error.tsx`) and per-section (`lp/error.tsx`, `admin/error.tsx`).
- Empty states are handled in `InvoiceTable` (explicit empty CTA).
- RTL support is implemented in the root layout via `dir={isRtl(locale) ? "rtl" : "ltr"}`.
- Honest-mode labelling is consistently applied across all simulated surfaces.
