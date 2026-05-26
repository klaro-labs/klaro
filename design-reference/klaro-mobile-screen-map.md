# Klaro Mobile Screen Map

Source: `Klaro Mobile offline.html`. The reference is a designer showcase that frames real product screens inside iOS phone bezels. **Production must extract the screen UI and drop the bezels.** No fake phone frames in real routes.

Screenshots: `design-reference/screenshots/mobile-deep/`. The reference auto-renders section 01 only; the other seven section names are present in the source and confirmed via grep. Where the reference is not paintable, the screen map below resolves the design from the Klaro v2 flow doc (§10–§22).

The reference uses the same brand tokens as the landing + brand kit — same Inter Tight headlines, same warm + ink palette, same mono eyebrow conventions. Mobile-specific additions are documented below per screen.

## Eight sections, twenty-six distinct screens

| Section | Screen count | Target route(s) |
| --- | --- | --- |
| 01 · Onboarding | 3 | `/signin`, `/vendor/onboarding`, `/vendor/onboarding/ready` |
| 02 · Vendor home | 3 | `/vendor`, `/vendor/balance`, `/vendor/invoices` |
| 03 · Invoice (vendor side) | 4 | `/vendor/invoices/new`, `/vendor/invoices/[id]`, `/vendor/invoices/[id]/share`, `/vendor/invoices/[id]/screening` |
| 04 · Buyer (hosted payment) | 4 | `/i/[id]`, `/i/[id]/pay`, `/i/[id]/route`, `/i/[id]/confirm` |
| 05 · Stenn-Proof receipt | 3 | `/receipt/[hash]`, `/receipt/[hash]/verify`, `/receipt/[hash]/share` |
| 06 · Cashout (USDC → INR) | 4 | `/vendor/cashout`, `/vendor/cashout/quote`, `/vendor/cashout/[id]`, `/vendor/cashout/[id]/receipt` |
| 07 · Trust score | 3 | `/vendor/reputation`, `/vendor/reputation/history`, `/vendor/reputation/unlock` |
| 08 · Settings | 2 | `/vendor/settings`, `/vendor/settings/security` |

Existing routes already exist for most of these in `apps/web/app/`. The mobile pass styles them, doesn't restructure.

## Section 01 · Onboarding (3 screens)

### 1a · Welcome
- Background: deep ink with subtle radial warm glow lower-left
- Logo top-left (mark + wordmark, white)
- Centred display headline: "Get paid in seconds." with terracotta accent on "seconds."
- Lede: "Invoice anyone in USDC. Cash out to local currency."
- Currency strip pill (mono): `USDC · EURC · INR · BRL · MXN · +7 more`
- Bottom CTA: full-width white pill "Continue with Google" with G icon
- Eyebrow above logo: `Sign in · wallet setup · the four-questions check. No phone required.`

### 1b · Account setup
- Light background
- K mark top-left
- Title: "Setting up your account"
- Sub: "Takes about 6 seconds. We're creating your wallet and identity passport."
- 4-row checklist with green-check icons:
  - ✓ Profile created
  - ✓ Wallet generated on Arc testnet
  - ⊙ Identity passport (ERC-8004) ← active loader
  - ○ First-time checks (queued)
- No CTA — auto-advances

### 1c · You're ready
- Light background
- Hero check icon (light-mint circle)
- Title: "You're ready, Asha."
- Sub: "Four things to know before your first invoice."
- Stack of 4 explainer cards, each: tiny icon + question + answer:
  - "Can I receive money?" — "Yes — your wallet is ready" (`0x7a3c…b21f at Arc testnet`)
  - "What chain am I on?" — "Arc testnet" — "Klaro is Arc-native. Customers can pay from any chain."
  - "Is this real or simulation?" — "Test flow · no real money" — "When mainnet launches, your account ports over."
  - "What if I lose my device?" — "Set up recovery" — "Add passkey + 2 trusted contacts (2 min)" (warm-tinted card)
- Bottom CTA: dark pill "Create first invoice →"

## Section 02 · Vendor home (3 screens)

### 2a · Dashboard
- Header: greeting + avatar
- Balance pill: USDC available + locked, with "Testnet" tag
- Quick actions row (3 buttons): New invoice / Request cashout / View receipts
- Activity list: last 5 events, each with status pill (paid / pending / settled)
- Bottom nav (5 tabs): Home / Invoices / Cashout / Trust / Settings

### 2b · Balance detail
- Six-row balance breakdown card (per v2 §17A): Available, Pending, Locked, Held, Cashoutable, Simulated
- Each row shows: amount + meaning text + action chip
- Chart strip: 7-day inflow / outflow sparkline

### 2c · Invoice list
- Tab strip: All / Open / Paid / Refunded
- List items with: amount, status pill, customer initial, due date, share icon

## Section 03 · Invoice (vendor side) (4 screens)

### 3a · New invoice
- Form: customer email, amount + currency picker (USDC / EURC), due date, line items (add/remove), memo, privacy mode toggle
- Preview button + Create button
- Fee estimate inline (mono): `Klaro fee 0.1% · network <$0.01`

### 3b · Invoice detail (open)
- Top: amount + status pill ("Open · waiting for payment")
- Timeline strip horizontal: Created → Shared → Viewed → Payment started → Paid → Released → Receipt
- Share row: copy link / WhatsApp / email / QR
- Customer card + buyer-acceptance hash status

### 3c · Share sheet
- Bottom sheet: copy URL, WhatsApp prefilled text, email subject + body, QR code render, download PDF
- "Mark as externally sent" toggle

### 3d · Screening status
- Active screening progress: 3 of 3 providers (Chainalysis · TRM · Sumsub — each `simulated` badge on testnet)
- Result row: pass / hold / block

## Section 04 · Buyer (hosted payment) (4 screens)

### 4a · Hosted invoice
- Vendor avatar + display name
- Amount large, in USDC + USD equivalent
- "What you're paying for" line items
- Payment method picker: Pay with wallet / Pay from another chain
- Trust footer: testnet label + privacy link

### 4b · Wallet pay
- Wallet picker (Rabby, MetaMask, Coinbase, WalletConnect)
- After connect: chain switcher if wrong network
- EIP-712 acceptance preview card with vendor + amount + invoice hash
- Confirm button (full-width dark pill)

### 4c · Cross-chain route
- "Pay from another chain"
- Source picker: Ethereum / Base / Polygon / (Solana via Gateway · access-gated)
- Quote: amount + route fee + estimated time + selected route type pill
- Route timeline: Funds found → Preparing → Moving USDC → Waiting confirm → Receiving on Arc → Payment received

### 4d · Confirmation
- Big green check + "Payment received"
- Tx hash row + Arc explorer link
- "View receipt" button + "Share with vendor" button

## Section 05 · Stenn-Proof receipt (3 screens)

### 5a · Receipt page (public)
- Top: VERIFIED gold pill + receipt ID
- Mono table: Invoice, Amount, Buyer signature (EIP-712 ✓), Screening (Passed), Settlement tx, Arc explorer link
- Privacy controls: hide/show amount, hide/show customer
- Footer: "Cryptographically verifiable. Paste the hash anywhere, get the same answer."

### 5b · Verify-by-hash
- Input field for receipt hash
- On verify: returns same receipt content, proves it's not server-faked

### 5c · Share receipt
- Copy public URL / Download PDF / Email / Share with customer
- Privacy preview before send

## Section 06 · Cashout USDC → INR (4 screens)

### 6a · Cashout home
- Available cashoutable USDC, current daily limit, current cashout history
- "Start cashout" primary CTA
- Recent cashouts list

### 6b · Quote
- Input USDC, sees INR output
- Rate source pill, LP spread, Klaro fee, total fee
- Expiry countdown
- Route pill: "INR Partner Cashout" / "Test flow · no real INR"
- Confirm CTA (disabled when quote expired)

### 6c · Order detail
- Cashout timeline: Quoted → Locked → LP assigned → Payout sent → Proof submitted → Vendor confirmation → Released
- Current state with case ID
- Confirm "I received INR" CTA (state-gated)
- Dispute link

### 6d · Receipt
- Same shape as invoice receipt but for cashout (USDC released to LP + INR mock proof)

## Section 07 · Trust score (3 screens)

### 7a · Score overview
- Big score number + tier badge
- Current limits row (per-invoice + daily + cashout)
- "Next unlock" preview card

### 7b · History
- Score changes chronological with reason + delta
- "+18 invoices settled clean" / "−9 dispute opened"

### 7c · Unlock paths
- Checklist of actions that raise limits: ERP connection, KYB, business domain proof
- Each row: status badge + "Complete now" CTA

## Section 08 · Settings (2 screens)

### 8a · Profile + business
- Avatar / name / business email / website / country / brand colour / brand logo upload
- Save button

### 8b · Security
- Passkey list + add new passkey
- Trusted contacts (2 needed for recovery)
- Connected providers (Google, etc.)
- Sign-out + danger zone (delete account, export data)

## Real UI vs prototype-only

| Prototype-only (drop) | Real UI (keep) |
| --- | --- |
| iPhone status bar (9:41 · signal · battery) | Bottom nav, sheet handles, card layouts |
| iPhone bezel + dynamic island | Full-bleed screens at 100% viewport width |
| Section dividers labelled "01 · Onboarding" etc. | (designer scaffolding — not in product) |
| Sample data ("Asha", `cl7-d3-m0`, `$4,200`) | Replaced with real account data wherever live; mock fallback explicitly labelled `[SIMULATED]` |

## Implementation rules

- Use `apps/web/components/klaro/MobileShell.tsx` as the mobile shell, add a bottom-nav variant where needed
- All sheets use Radix Dialog primitives (not the offline-export's hand-rolled sheets)
- Full-width tap targets (≥44px)
- No horizontal overflow at 320px (smallest tested)
- Status pills + mono eyebrow tokens from brand system
- Match the warm + ink + soft-warm palette per `klaro-brand-system.md`

## Implementation target

Mobile pass touches the same routes that already exist in `apps/web/app/`. The mobile reference is for **visual polish** — most of these routes already render correctly on mobile via Tailwind's responsive utilities. The pass adjusts spacing, eyebrow placement, sheet behaviour, and balance-breakdown rendering to match the reference.

Routes that need a brand-new mobile-first layout (don't exist or are stubs today):
- `/vendor/onboarding/ready` — currently part of `/signin` flow
- `/vendor/balance` — currently part of `/vendor`
- `/vendor/reputation/history` — currently a static list on `/vendor/reputation`
- `/vendor/reputation/unlock` — currently a static list

For the v1 of the mobile pass, focus on the routes that have the **highest user volume**: vendor home, invoice list + detail, hosted invoice page (buyer flow), receipt page, cashout. Section 07 (Trust score) and 08 (Settings) ship after.
