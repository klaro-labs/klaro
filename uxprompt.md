# GOD-LEVEL KLARO UI/UX IMPLEMENTATION PROMPT

You are a world-class senior frontend engineer, product designer, design-system engineer, motion designer, QA engineer, and visual regression specialist.

You are working on my existing product called Klaro.

Your job is to transform the existing product UI/UX so it matches the provided Klaro reference experience with extremely high fidelity.

This is not a simple HTML-copying task.

This is a full design-system extraction, product-wide UI implementation, visual QA, interaction QA, screen-recording comparison, and code-quality audit task.

## Core mission

I have three reference HTML files:

1. `Klaro Landing offline.html`
2. `Klaro Brand Kit offline.html`
3. `Klaro Mobile offline.html`

These are offline bundled HTML exports.

Treat them as visual, brand, interaction, layout, motion, and product-experience references.

Do NOT blindly copy the HTML.

Your job is to understand the design intent, extract the design system, map the screens, and rebuild the UI cleanly inside the existing product architecture.

The existing product code is the source of truth for:
- app architecture
- routing
- auth
- state
- APIs
- database calls
- business logic
- real product behavior

The reference HTML files are the source of truth for:
- visual design
- brand identity
- landing page experience
- mobile UI direction
- motion feel
- spacing rhythm
- component style
- premium/professional polish

## Reference file roles

### 1. Landing page reference

`Klaro Landing offline.html` is the source of truth for the public landing page.

The production landing page must visually and experientially match this reference.

You must match:
- page flow
- section order
- hero composition
- navigation/header
- CTA hierarchy
- typography
- colors
- spacing
- cards
- surfaces
- borders
- shadows
- logo treatment
- scroll rhythm
- responsive behavior
- hover states
- animations
- overall premium feeling

The goal is not just “similar components.”
The goal is that when we scroll through the reference landing page and the production landing page, the experience feels like the same product.

### 2. Brand kit reference

`Klaro Brand Kit offline.html` is the source of truth for the entire Klaro brand system.

You must extract the brand system and apply it throughout the product, including:
- landing page
- auth pages
- dashboard
- invoices
- payments
- settings
- mobile version
- desktop version
- modals
- forms
- empty states
- error states
- loading states

The brand kit is not only for one page.

It must become the design foundation of the whole product.

Also create an official public Brand Kit page inside the product.

Create the route using the existing app convention, preferably one of:
- `/brand`
- `/brand-kit`
- `/brandkit`

The page must feel official, polished, public, and production-ready.

It should include:
- brand introduction
- logo / wordmark usage
- color palette
- typography
- voice and tone
- UI components
- buttons
- inputs
- cards
- surfaces
- icons
- do / don’t examples
- downloads/assets section if relevant
- usage guidelines

### 3. Mobile reference

`Klaro Mobile offline.html` is the source of truth for the mobile product experience.

This file contains many mobile screens combined together.

Do NOT treat it as one single page.

You must first identify and map every distinct mobile screen, state, modal, bottom sheet, tab, flow, and interaction.

The mobile reference may show screens inside iOS phone frames.

Important:
- Use the actual mobile UI design.
- Do not copy the fake iPhone shell into the real app unless creating a marketing mockup.
- Do not copy showcase frames into production mobile screens.
- Do not copy prototype scaffolding.
- Extract the actual product UI inside the frames.

## Critical warning about offline HTML exports

The provided HTML files are bundled offline exports.

Never copy these into production:
- bundler wrappers
- unpacking/loading scripts
- thumbnail placeholders
- `__bundler_loading`
- `__bundler_thumbnail`
- generated blob logic
- offline asset unpacking code
- React/Babel CDN runtime from the export
- fake preview containers
- fake browser chrome
- fake phone shells unless intentionally needed
- debug overlays
- prototype labels
- demo-only controls
- temporary sample state
- unused scripts
- generated export scaffolding
- hardcoded fake data that conflicts with the real product

You must extract design intent and rebuild cleanly in the actual frontend stack.

## Required operating mode

Do not start by editing production code.

First understand everything.

Then write a plan.

Then implement.

Then visually verify.

Then record and compare.

Then audit code.

Then polish.

Then report honestly.

## Phase 1 — Inspect existing product

Before touching production code, inspect the existing product.

Identify:
- frontend framework
- routing system
- styling system
- component library
- state management
- auth system
- API/data flow
- existing layout structure
- existing design tokens
- reusable components
- mobile responsiveness approach
- current landing page implementation
- current brand-related pages if any
- current mobile layouts

Create or update:

`design-reference/klaro-ui-implementation-plan.md`

Include:
- existing app architecture summary
- frontend stack
- routing conventions
- styling conventions
- files likely to change
- risks
- assumptions
- implementation order

Do not edit production UI until this plan exists.

## Phase 2 — Open and inspect the reference HTML files in browser

You must not only read the source code.

You must open the reference HTML files visually in a real browser.

Use the available browser/devtools/playwright tools.

If direct `file://` opening is unreliable, serve the files locally with a simple static server and open them through localhost.

For each reference file:
1. Open the HTML page.
2. Wait until the offline bundle has fully unpacked/rendered.
3. Confirm the real UI is visible, not just the thumbnail/loading screen.
4. Inspect the DOM and computed styles.
5. Capture screenshots.
6. Record observations.
7. Identify what is real design vs export scaffolding.

For `Klaro Landing offline.html`, you must:
- open the page visually
- start at the top
- scroll slowly through the entire page
- observe the complete flow
- inspect section transitions
- inspect CTA behavior
- inspect hover states where possible
- inspect responsive behavior
- record a video of the full landing page scroll
- capture screenshots at important sections

For `Klaro Brand Kit offline.html`, you must:
- open the page visually
- inspect brand colors
- inspect typography
- inspect logo usage
- inspect UI components
- inspect brand rules
- record key screenshots
- extract design tokens

For `Klaro Mobile offline.html`, you must:
- open the page visually
- inspect all mobile screens
- identify each distinct screen
- identify states, modals, sheets, tabs, flows, and interactions
- distinguish actual app UI from iOS mockup frames
- create a mobile screen map before implementing mobile UI

## Phase 3 — Create required reference documentation

Create or update these files:

### `design-reference/klaro-brand-system.md`

Include:
- color tokens
- typography tokens
- spacing scale
- radius scale
- shadow system
- border system
- surface system
- logo rules
- wordmark rules
- button styles
- input styles
- card styles
- modal/sheet styles
- navigation styles
- mobile styles
- icon style
- tone/voice
- motion style
- accessibility notes
- do/don’t rules

### `design-reference/klaro-landing-flow.md`

Include:
- full landing page section map
- section-by-section description
- layout notes
- CTA hierarchy
- animation/motion notes
- responsive behavior
- visual details that must match
- screenshots/video references if generated
- production implementation target files

### `design-reference/klaro-mobile-screen-map.md`

Include every distinct mobile screen from `Klaro Mobile offline.html`.

For each screen:
- screen name
- purpose
- visible UI
- primary action
- secondary actions
- navigation source
- destination
- state/data needs
- modals/sheets/overlays
- empty/loading/error states
- visual notes
- motion notes
- real UI vs prototype-only elements
- implementation target

### `design-reference/klaro-ui-implementation-plan.md`

Include:
- implementation sequence
- routes to change/add
- components to create/update
- tokens to add/update
- files to modify
- validation checklist
- visual QA plan
- screen recording plan
- known assumptions

## Phase 4 — Four-layer verification system

You must verify the work using four layers.

### Layer 1: Visual verification

Check everything visually.

Compare reference vs production for:
- layout
- spacing
- typography
- colors
- borders
- shadows
- radius
- logo usage
- section rhythm
- CTA hierarchy
- visual hierarchy
- responsiveness
- mobile layout
- desktop layout
- scroll feel
- premium/professional feeling

Do not rely only on code.

You must look at the rendered pages.

### Layer 2: Code-level audit

Use frontend engineering judgment to audit the implementation.

Check:
- no copied bundler junk
- no loading overlays from exported HTML
- no thumbnail placeholders
- no fake prototype wrappers
- no duplicate app shells
- no broken z-index layers
- no hidden overlays blocking clicks
- no accidental fixed-position junk
- no unused giant exported scripts
- no hardcoded fake data where real product data should be used
- no broken responsive classes
- no hydration issues
- no console errors
- no broken imports
- no TypeScript errors
- no lint errors if linting exists
- no accessibility regressions
- no route conflicts
- no business logic regressions

Audit every affected page.

### Layer 3: Screen-recording comparison

This is required, especially for the landing page.

You must record the reference and production flows.

For the landing page:

1. Open `Klaro Landing offline.html`.
2. Wait for full render.
3. Start screen/video recording.
4. Scroll from top to bottom at a steady pace.
5. Interact with meaningful hover/click states if possible.
6. Save the video as a reference recording.

Then:

1. Open the production landing page locally.
2. Start screen/video recording.
3. Scroll from top to bottom at the same viewport size and similar speed.
4. Interact with the same meaningful hover/click states.
5. Save the video as a production recording.

Then compare:
- scroll rhythm
- section timing
- visual flow
- layout transitions
- animation smoothness
- CTA prominence
- perceived polish
- professional feeling
- whether the product feels like the reference

If video recording tools are not available, use Playwright screenshots at multiple scroll positions and document the limitation clearly.

Recommended screenshot checkpoints:
- top hero
- after first scroll
- middle section 1
- middle section 2
- CTA/product section
- final CTA/footer
- mobile hero
- mobile mid-page
- mobile footer

### Layer 4: Intent, taste, and creative QA

Use product/design judgment beyond mechanical matching.

Ask:
- Does this feel like Klaro?
- Does it feel premium?
- Does it feel professional?
- Does it feel trustworthy for payments/invoicing/stablecoins?
- Does it feel consistent across landing, brand kit, desktop app, and mobile app?
- Would a real user understand the product faster?
- Would an investor/customer trust this interface?
- Are there any places where exact copying would be worse than a thoughtful adaptation?
- Are there any interactions that should be smoother?
- Are there any components that feel generic or off-brand?
- Are there any inconsistencies that break the brand feeling?

If exact matching conflicts with product usability, choose the better product experience and document why.

## Phase 5 — Landing page implementation requirements

Make the production landing page visually match `Klaro Landing offline.html`.

Before editing:
- record/reference-scroll the original HTML
- capture screenshots
- map all sections
- inspect computed styles
- identify animations

During implementation:
- preserve existing routing
- preserve SEO metadata where appropriate
- use app’s real stack
- use reusable components
- use brand tokens from the brand kit
- avoid generic template styling
- avoid random redesigns
- avoid “close enough” UI

After implementation:
- open production landing page
- scroll the full page
- record production video
- compare with reference video
- fix mismatches
- repeat until high fidelity

The landing page is successful only when:
- the full scroll experience feels aligned with the reference
- visual hierarchy matches
- spacing rhythm matches
- CTA treatment matches
- responsive behavior is polished
- no obvious alignment or interaction mistakes remain

## Phase 6 — Brand system implementation requirements

Extract the brand system from `Klaro Brand Kit offline.html`.

Implement shared design tokens in the product.

Use the existing styling system. Depending on the app, this may mean:
- CSS variables
- Tailwind theme extension
- design token file
- theme provider
- component variants
- shared CSS module
- global stylesheet

Create tokens for:
- background
- foreground
- muted text
- primary
- secondary
- accent
- border
- card
- surface
- destructive/error
- success
- warning
- radius
- shadows
- spacing
- typography
- motion easing
- motion duration

Apply them across the product.

Create official brand kit page.

The brand kit page should not look like a developer dump.
It should look like a polished official product page.

## Phase 7 — Mobile implementation requirements

Analyze `Klaro Mobile offline.html` fully before coding.

Create `design-reference/klaro-mobile-screen-map.md`.

Only after the screen map exists, implement mobile UI.

Mobile implementation rules:
- use real responsive layout
- use real app state
- use real navigation
- use real product data where available
- implement bottom nav/tabs/sheets/modals where appropriate
- do not copy fake iPhone frame into app UI
- do not make static screenshots
- do not flatten all screens into one page
- do not ignore interactions
- do not ignore mobile spacing
- do not ignore touch targets

Validate on:
- small mobile width
- standard mobile width
- tablet if relevant
- desktop responsive fallback if relevant

## Phase 8 — Interaction and motion requirements

Implement motion carefully.

Match the reference feel.

Check:
- hover states
- tap states
- focus states
- modal open/close
- sheet open/close
- dropdowns
- nav transitions
- mobile tab switching
- CTA hover
- card hover
- scroll-triggered reveals if present
- loading states

Avoid:
- childish animation
- excessive bounce
- too-slow transitions
- random animation not in reference
- performance-heavy effects
- animation that harms usability

Motion should feel:
- premium
- quick
- subtle
- confident
- modern
- intentional

## Phase 9 — Accessibility and usability

Ensure:
- semantic HTML
- keyboard navigation
- visible focus states
- accessible buttons/links
- correct labels for inputs
- sufficient contrast
- no keyboard traps
- modals/sheets are accessible
- reduced-motion support where appropriate
- mobile touch targets are usable
- no horizontal overflow
- no hidden elements blocking interaction

## Phase 10 — Testing and validation commands

Use the project’s existing commands.

Run whatever exists, such as:
- install
- typecheck
- lint
- test
- build
- dev server

If package scripts exist, inspect them first.

Do not invent commands blindly.

If errors appear:
- fix them
- rerun
- document anything that cannot be fixed

## Phase 11 — Final QA checklist

Before saying the task is complete, confirm:

Landing page:
- [ ] Reference HTML opened visually
- [ ] Reference landing page fully scrolled
- [ ] Reference landing page recorded or checkpointed
- [ ] Production landing page opened visually
- [ ] Production landing page fully scrolled
- [ ] Production landing page recorded or checkpointed
- [ ] Flow compared
- [ ] Visual mismatches fixed

Brand:
- [ ] Brand kit opened visually
- [ ] Brand tokens extracted
- [ ] Tokens implemented
- [ ] Brand system applied across product
- [ ] Official brand kit page created
- [ ] Brand page checked on desktop and mobile

Mobile:
- [ ] Mobile HTML opened visually
- [ ] All screens mapped
- [ ] Prototype-only elements identified
- [ ] Mobile UI implemented using real app structure
- [ ] Mobile interactions checked
- [ ] Mobile responsiveness checked

Code:
- [ ] No exported bundler junk copied
- [ ] No thumbnail/loading overlays copied
- [ ] No fake wrappers copied
- [ ] No console errors
- [ ] No broken routes
- [ ] No TypeScript/build errors
- [ ] No obvious accessibility regressions
- [ ] No business logic regression

Experience:
- [ ] Product feels premium
- [ ] Product feels professional
- [ ] Product feels consistent
- [ ] Product feels like Klaro
- [ ] Exact matching was balanced with real usability

## Final response format

When finished, respond with:

1. What reference files you opened
2. What videos or screenshots you captured
3. What pages/screens you implemented
4. What brand tokens you extracted
5. What routes you added or changed
6. What components you created or updated
7. What files changed
8. What you intentionally did not copy from the HTML exports
9. What visual QA you performed
10. What screen-recording comparison showed
11. What code-level audit found
12. What remains different from the reference, if anything
13. How I can run and test everything locally

Be honest.

Do not claim you visually checked something unless you actually opened it.

Do not claim you recorded video unless you actually recorded video.

Do not mark the task complete if the UI still has obvious visual mismatch, broken alignment, broken interaction, copied prototype junk, or generic-looking styling.

## Start now

First:
1. Inspect the existing product.
2. Open the three reference HTML files visually.
3. Create the design-reference documentation files.
4. Do not edit production code until the documentation and implementation plan exist.