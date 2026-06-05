# Klaro — Full Human-Flow QA Test Plan

Test the product the way a **real user** moves through it — end to end, through the
UI, every persona, every journey. This is dogfooding, not unit testing: we're
hunting the bugs that only appear when a human actually clicks.

Grounded in the real route map (85 pages / 30 API routes / 22 action files).

---

## Universal verification rubric — apply to EVERY flow below

For each step, don't just check "did it not crash." Check all of these:

1. **Works** — the action completes, no crash, no dead-end, no infinite spinner.
2. **Persists (live DB)** — reload the page / cold-start: the result is still there
   (the T1 class of bug — looked live, vanished). Verify the actual row.
3. **Honest label** — the surface says **live / simulated / partner-pending**
   correctly. No "looks live but writes to mock." No fake success.
4. **On-chain (where relevant)** — the tx actually fires and the DB mirrors chain
   truth (not the other way around).
5. **Empty state** — first-time user with no data: does it render sensibly?
6. **Error state** — bad input, expired quote, insufficient balance, wrong wallet,
   double-click, network drop: is the error honest + recoverable?
7. **Permission / RLS** — can a user see or act on another tenant's data? (try it)
8. **Auth boundary** — logged-out access redirects to signin, doesn't 500.
9. **Mobile + desktop** — especially cashout (full mobile state machine) and nav.
10. **Back button / refresh mid-flow** — no broken state, no double-submit.

> Legend: 💰 = money-critical (extra scrutiny) · 🔗 = on-chain · 🏷️ = honest-label sensitive

Methodology follows `AI_WEB3_TESTING_GUIDE.md` (act→audit loop §6, source-of-truth
depth §19.3, adversarial §13, launch-ready gate §17.1). This file is the **coverage
contract** that guide §3.4 demands: nothing in the inventory below ships untested.

---

## Per-product config (guide §2)

```
Product:            Klaro — Arc-native USDC payment OS (invoicing, cashout, FX, agents, LP)
Framework:          Next.js 15 App Router + React 19 + wagmi/viem
Test stack:         Playwright (pb-*.ts harness) · Vitest (web 105 + daemon 55) · Foundry (525)
Dev server:         REDIS_URL= pnpm dev -p 3100   @ http://localhost:3100  (inline-queue mode)
Chains:             Arc testnet (5042002, USDC 0x3600…0000 6-dec, gas-in-USDC) + CCTP source chains
Wallet model:       Circle Modular Wallets (passkey) · injected EIP-1193 (test) · real-extension (Rabby)
Faucet/seed:        operator wallet 0xAD57…EB94 funded ~8 USDC; fund test wallets from it
Contracts:          22 (InvoiceEscrow, CashoutOrderProcessor, DisputeManager, AgentEscrow, LPStaking,
                    RetainerStream, AuditReceipt, FeeSplitter, MultiChainRouter, …) — abis/v1.0
Public surfaces:    /i/[id] hosted invoice · /pay/[slug] link · /receipt/[hash] · /agents/[id]
Realtime:           BullMQ daemon workers + Arc event listener (no websocket to the browser)
Default level:      L3 (maximal) — but money-critical chains (§8) first
```

---

## FEATURE INVENTORY — coverage contract (every feature · outcome · source of truth · honest status)

Each row is a thing to PROVE, not just "the feature exists." Verify the **outcome**
(success + the named failure) against the **source of truth** (not just the UI).
Honest status = what the surface must truthfully say.

### A. Identity & onboarding
| # | Feature | Expected outcome (success / key failure) | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|A1| Magic-link auth | logged-in session / expired-link → clean error | Supabase auth | 1 | P0 | live |
|A2| Passkey auth (WebAuthn) | register + assert → session / rejected → recover | DB + authenticator | 1 | P0 | live |
|A3| Onboarding (4-step) | vendor + wallet provisioned, resumes on refresh | DB `vendors` + Circle Wallets | 1 | P0 | wallet 🏷️ sim/partner-pending |
|A4| Logout / session expiry | `/vendor/*` → redirect signin, no 500 | cookie/session | 1 | P0 | live |

### B. Invoicing & payment 💰🔗
| # | Feature | Expected outcome (success / key failure) | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|B1| Invoice create | `invoices` row, hosted link / invalid amount rejected | DB | 1 | P0 | live |
|B2| Invoice publish on-chain | anchored in InvoiceEscrow / wrong wallet blocked | on-chain | 1 | P0 | live testnet |
|B3| Hosted-invoice pay (`acceptAndPay`) | PAID + USDC escrowed / insufficient USDC, wrong chain, reject | on-chain InvoiceEscrow | 2 | P0💰 | live testnet |
|B4| Screening (3-of-3) | evidence rows + **hold for review** / fail → admin-review | DB + on-chain recordScreening | daemon | P0🏷️ | **SIMULATED — never auto-settles** |
|B5| Settle | SETTLED + USDC released to vendor | on-chain `settle` | daemon | P0💰 | live (only after pass) |
|B6| Receipt mint | AuditReceipt minted, `/receipt/[hash]` verifies | on-chain AuditReceipt | daemon | P0🔗 | live; hash == contract hash |
|B7| Payment links (Klaro Link) | create → external pay → reflected | DB + on-chain | 2 | P0💰 | live testnet |
|B8| Recurring invoices | schedule persists / honest if it doesn't auto-fire | DB | 1 | P1 | 🏷️ verify firing |
|B9| Bulk import | rows created, bad rows reported | DB | 1 | P2 | live |

### C. Cashout 💰🔗🏷️
| # | Feature | Expected outcome (success / key failure) | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|C1| Request + lock (`requestAndLock`) | order LOCKED, USDC escrowed / expired quote, wrong wallet | on-chain CashoutOrderProcessor | 1 | P0💰 | live testnet |
|C2| Quote-hash integrity | tampered quote rejected | server recompute | 1 | P0💰 | live |
|C3| LP claim (`claimByLP`) | CLAIMED, CAS race-safe | on-chain + daemon | LP+op | P0💰 | LP sim |
|C4| Proof submit (`recordProof`) | PROOF_SUBMITTED / simulated proof never anchors | on-chain + daemon | LP+op | P0🏷️ | **fiat SIMULATED** |
|C5| Confirm / release (`operatorConfirmReceived`) | RELEASED, USDC → LP, DB after tx | on-chain + daemon | vendor+op | P0💰 | live testnet |
|C6| Fiat payout (INR→bank) | — | licensed partner | — | P0🏷️ | **PARTNER-PENDING (mainnet)** |
|C7| Mobile cashout state machine | 6 states render correctly | DB | 1 | P1 | 🏷️ "no INR moves" |

### D. Disputes 💰
| # | Feature | Expected outcome (success / key failure) | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|D1| Open + evidence | OPENED→EVIDENCE_SUBMITTED / vendor self-decide → 403 | DB (2-table) | vendor/LP | P0💰 | live |
|D2| Operator decide | DisputeManager.decide signed via daemon / not faked in live | on-chain via daemon | operator | P0💰 | live (daemon-signed) |
|D3| Resolve → escrow | resolveDispute moves funds (deterministic outcomes) | on-chain via daemon | operator | P0💰 | SLASH/PENALIZE → admin |

### E. Agents 🏷️
| # | Feature | Expected outcome / failure | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|E1| Hire + lifecycle (create→fund→start→deliver→accept) | `agent_jobs` mirrors each stage | DB + on-chain JobCompleted | 1 | P1 | escrow 🏷️ PARTNER-PENDING |
|E2| Agent registry (ERC-8004) | identity / no real agents | on-chain AgentRegistry | — | P2 | 🏷️ PARTNER-PENDING |
|E3| Agent call (x402) | 402 negotiation / 200 on pay | x402/Gateway | agent dev | P2 | 🏷️ SIM unless X402_ENABLED |
|E4| Agent budget wallet | spend caps | on-chain AgentBudgetWallet | — | P2 | testnet |

### F. Retainer · FX · Delegations 🏷️
| # | Feature | Expected outcome / failure | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|F1| Retainer create/withdraw/cancel | `retainer_streams` + vesting math | DB | 1 | P1 | 🏷️ on-chain funding PARTNER-PENDING |
|F2| FX quote + settle | `fx_quotes`, "demo completed" | DB | 1 | P1 | 🏷️ StableFX PARTNER-PENDING |
|F3| Delegations (session keys) | `session_keys` issue/revoke | DB | 1 | P1 | 🏷️ Circle ERC-6900 enforcement PENDING |

### G. LP (liquidity provider) 💰🏷️
| # | Feature | Expected outcome / failure | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|G1| Apply → docs → approve | `lp_profiles` status transitions (enum-mapped) | DB | LP+op | P1 | live |
|G2| Stake | STAKED + tier / below-min rejected | DB + on-chain LPStaking | LP | P1💰 | 🏷️ LPStaking PARTNER-PENDING |
|G3| Rotate payout wallet | persists / same-wallet rejected | DB | LP | P1 | live |
|G4| Claim order | CAS-safe claim | DB | LP | P1💰 | live |
|G5| Prefs/corridor toggles | — | (no table) | LP | P2 | 🏷️ "Coming soon" (refuses) |

### H. Team · settings · integrations
| # | Feature | Expected outcome / failure | Source of truth | Users | Pri | Honest status |
|---|---|---|---|---|---|---|
|H1| Team RBAC (invite/role/remove) | `vendor_team_members`, role gates | DB | 1 | P1 | live |
|H2| Branding settings | persists, shows on invoice/receipt; reject data: URLs | DB | 1 | P2 | live |
|H3| Webhooks (register/test/deactivate) | secret revealed once + encrypted; delivery | DB + RPC | 1 | P1 | 🏷️ delivery uses global secret |
|H4| ERP sync | — | — | 1 | P2 | 🏷️ PLANNED/SIM |
|H5| Exports | CSV/PDF downloads, content correct | DB read | 1 | P2 | live |

### I. Circle / web3 building blocks (the grant story — verify each is real or labeled)
| # | Block | Expected outcome / failure | Source of truth | Pri | Honest status |
|---|---|---|---|---|---|
|I1| USDC on Arc | balances, transfers, gas-in-USDC | on-chain | P0 | live testnet |
|I2| Circle Modular Wallets (passkey) | provision + sign | Circle API | P0 | 🏷️ live if `CIRCLE_CLIENT_KEY` |
|I3| CCTP cross-chain USDC | burn→mint via MultiChainRouter | on-chain CCTP | P2🔗 | testnet |
|I4| Gateway / x402 | facilitated nanopayments | Gateway | P2 | 🏷️ SIM unless enabled |
|I5| StableFX (FxEscrow + Permit2) | on-chain swap | on-chain | P1 | 🏷️ access PARTNER-PENDING |
|I6| Permit2 | allowance via signature | on-chain | P1 | live testnet |
|I7| Paymaster / gas | who pays gas (USDC) | on-chain | P1 | live testnet |

### J. Platform integrations (env-gated — verify live-vs-sim honesty)
| # | Integration (`*Live` flag) | Live when | Else | Verify |
|---|---|---|---|---|
|J1| Resend email | `RESEND_API_KEY` | console/no-op | lifecycle emails actually arrive 🏷️ |
|J2| Apple/Google Wallet pass | certs set | sim | pass downloads + installs 🏷️ |
|J3| MoonPay on-ramp | `MOONPAY_PUBLIC_KEY` | sim | sandbox buy widget 🏷️ |
|J4| Screening provider | provider key | **fail-closed review** | never auto-pass 🏷️ |
|J5| Sentry / PostHog / GrowthBook | keys set | no-op | no PII leak; flags resolve |
|J6| Counterparty denylist | `COUNTERPARTY_REGISTRY_ADDRESS` | simulated | source:error not silent-sim 🏷️ |

### K. Admin / operator 💰
| # | Feature | Expected outcome / failure | Source of truth | Pri | Honest status |
|---|---|---|---|---|---|
|K1| Operator gate | non-operator → forbidden everywhere | session role | P0💰 | live |
|K2| Decide / request-evidence | → daemon (see D2) | on-chain via daemon | P0💰 | live |
|K3| Manual-review / risk-holds / sanctions | approve/hold review queue | DB | P1 | 🏷️ screening sim |
|K4| Audit log | every operator action recorded | DB | P1 | live |
|K5| Pause | protocol pause guard | on-chain | P1💰 | 🏷️ honest if refuses |
|K6| Limits / case-management / KPI | render + enforce | DB | P2 | live |

### L. Protocol mechanics (contract-level — Foundry-covered; spot-check the UI touchpoint)
| # | Contract / mechanic | UI touchpoint to spot-check | Pri | Honest status |
|---|---|---|---|---|
|L1| FeeSplitter | Klaro fee shown on invoice/cashout quotes matches on-chain split | P1💰 | live testnet |
|L2| ReputationManager / VendorReputation | `/vendor/reputation`, `/lp/reputation` render real scores | P2 | live-read / 🏷️ sim |
|L3| RefundProtocol | invoice/dispute refund path returns USDC | P1💰 | testnet |
|L4| ProofRegistry | payout-proof anchor behind cashout C4 | P1 | live testnet |
|L5| RoutePolicyEngine / MultiChainRouter | corridor routing + CCTP (I3) | P2 | testnet |
|L6| CounterpartyRegistry | denylist/screening (J6) — blocks a denied counterparty | P1🏷️ | sim unless addr set |
|L7| PrivacyVeil | any masked/encrypted amount renders masked, never plaintext | P3 | verify no leak |
|L8| KlaroConfig / ReasonCodes | internal — reason hashes match `klaro.reason.*` | — | Foundry only |

> **Coverage audit (guide §16):** the journeys in §1–§8 below are how you WALK these
> features. Cross-check at the end: every inventory row above (A1…L8) must have a
> recorded proof (audited screenshot + DB/on-chain read). Any row without proof =
> a gap = not done. The launch-ready gate (guide §17.1) passes only at zero gaps.

---

## VISUAL AUDIT PROTOCOL — screenshot AND judge, every screen, every step

**Capturing a screenshot is not testing. Reading it is.** Every single step of
every flow follows the act→audit loop (guide §6):

```
ACT (one interaction) → CAPTURE fullPage screenshot (desktop 1280×800 AND mobile 375×812)
→ READ the screenshot with vision → JUDGE against the checklist below
→ only proceed if it passes; if not, log the defect with the shot, stop that flow.
```

Capture the transition shots for every flow: `pre-action → input-filled →
submitting → pending → post-confirm → final-result`. Record **video** of each flow.

**Per-screen visual checklist — judge EVERY captured screen against ALL of these:**
- [ ] **Layout** — nothing overlapping, clipped, cut off, off-canvas, or z-fighting.
- [ ] **Text** — no truncation mid-word, no overflow, readable contrast; **no leftover
      `lorem ipsum` / "TODO" / placeholder**; no raw stack trace / `[object Object]` /
      error dump shown to a user.
- [ ] **Images/icons/avatars/QR** load (no broken-image, no infinite shimmer).
- [ ] **Data correct** — numbers formatted, dates sane, long addresses ellipsised not
      broken, amounts not mis-decimaled; empty lists show a real empty state.
- [ ] **Interaction states** — hover/focus/active/disabled visible; loading/skeleton →
      content transition actually happens (no stuck spinner, no flash of empty).
- [ ] **Feedback** — every click is acknowledged *immediately* (spinner/disable/toast);
      flag any dead time where a human would think "did it freeze?"
- [ ] **Honesty** — the screen matches the real source of truth (DB/on-chain), and the
      live/simulated/partner-pending label is truthful.
- [ ] **Responsive** — at mobile: on-screen keyboard doesn't cover the input/submit, tap
      targets big enough, no horizontal scroll, bottom-nav/hamburger reachable.

**Instrument every context** (console errors, pageerror, failed network requests). A
flow that "worked" but threw a console error or a 4xx/5xx on the happy path is a
**defect** — surface it.

**Give a human verdict (guide §0.2):** beyond pass/fail, report friction — too many
steps, confusing moments, anything that felt slow or untrustworthy. That qualitative
read is part of the job.

---

## MULTI-USER MATRIX — real isolated contexts + sync verification

**Rule (guide §5–§8):** one `BrowserContext` per persona — **never** fake a multi-party
flow by one account switching. Drive the contexts like a conversation, pass the real
artifact (URL/hash) between them, and **capture BOTH screens before/after**. Then prove
the datum agrees on **every surface** + the **source of truth** (on-chain/DB), not just
one screen (guide §0.2 "follow one value everywhere").

| Flow | Parties (separate contexts) | Hand-off | Sync to verify on BOTH screens | Source of truth |
|---|---|---|---|---|
| **Invoice → pay** | Vendor + Buyer | vendor's hosted-invoice URL → buyer | buyer pays → vendor dashboard flips to PAID (no manual reload past the app's refresh) | on-chain InvoicePaid + `invoices.status` |
| **Payment link** | Vendor + Payer | link URL → payer | payer pays → vendor sees usage/paid | on-chain + DB |
| **Cashout** | Vendor + LP + Operator(daemon) | order id flows vendor→LP→confirm | vendor sees LOCKED→CLAIMED→PROOF→RELEASED as LP/daemon advance; LP sees the claim | on-chain order status + `cashout_orders` |
| **Dispute** | Claimant(vendor) + Respondent(LP) + Operator | caseId across all three | both parties see status; operator decides → both see DECIDED + the resolution | on-chain DisputeManager + `disputes` |
| **Agent job** | Vendor(principal) + Agent | jobId | vendor advances → agent view reflects; JobCompleted → CLOSED both sides | on-chain AgentEscrow + `agent_jobs` |
| **Team invite** | Owner + Teammate | invite → teammate logs in | teammate gains scoped access; owner sees them ACTIVE | `vendor_team_members` |
| **LP claim race** 💰 | LP-A + LP-B (concurrent) | same order id to both | exactly ONE wins the claim; the other gets a clean "already claimed" — **no double-claim** | `cashout_orders` CAS |

**Concurrency (guide §8):** for the LP-claim race and any shared-state action, have two
contexts act at nearly the same instant → assert no lost update, no duplicate, no
corrupted shared state. Capture both screens at the moment of contention.

**Wallet popups are multi-context too:** for on-chain steps, verify the **wallet popup
shows the correct network + contract + params** and they match what the app screen
promised before signing (guide §0.2). Test approve AND reject AND wrong-network.

---

## 0. Cross-cutting (run continuously, not as one pass)

- [ ] 🏷️ **Honest-mode sweep** — on every surface that shows a status/badge, confirm
      it reads live/simulated/partner-pending truthfully. Specifically re-check:
      cashout fiat leg, retainer vesting, FX "demo completed", LP staking,
      delegations (Circle enforcement pending), agents (escrow partner-pending).
- [ ] **Tenant isolation** — log in as vendor A, grab an ID, try to open/act on it
      as vendor B (URL-poke `/vendor/invoices/<A's id>`, cashout, dispute, etc.).
      Must 404/forbid, never leak.
- [ ] **Logged-out** — hit every `/vendor/*`, `/lp/*`, `/admin/*` while signed out →
      redirect to `/signin`, no 500.
- [ ] **Daemon down / inline mode** — flows that enqueue (cashout advance, dispute
      decide, screening, receipts, webhooks): what does the user see if the daemon
      isn't running? Honest "processing" not fake "done."
- [ ] **Quote expiry** — let a cashout/FX quote sit past expiry, then act → clean
      "quote expired, refresh" not a crash or a stale execution.
- [ ] **Double-submit** — double-click every money button; idempotent, no double row.

---

## 1. Public visitor (logged OUT)

- [ ] `/` landing — renders, hero, nav mega-menu (Product/Resources) opens, CTAs route.
- [ ] `/product` + subpages: `/product/invoicing`, `/product/cashout`,
      `/product/stablefx`, `/product/receipts`, `/product/reputation` — all render, no 404.
- [ ] `/pricing` — 3 tiers, FAQ; numbers match reality (Free / 1.0% / Custom).
- [ ] `/build`, `/developers` (301→/build?), `/docs`, `/resources`, `/resources/flows`.
- [ ] `/company`, `/company/contact` — submit the contact form → honest confirmation,
      message actually goes somewhere (or honestly says where).
- [ ] `/agents`, `/agents/[agentId]` — agent marketplace listing renders.
- [ ] `/brand-kit`, `/roadmap`, `/help`, `/trust`, `/status`, `/x402-demo`.
- [ ] `/legal/*` (terms, privacy, cookies, dpa, disclosures, subprocessors,
      acceptable-use) — all 8 render.
- [ ] `/offline`, `/account/privacy` (privacy choices form → actions).
- [ ] Mobile: nav collapses, mega-menu usable, no horizontal scroll.

---

## 2. Auth & onboarding

- [ ] `/signin` — **magic link**: enter email → email arrives → click → logged in,
      lands in `/vendor`. 💰 session persists across reload + new tab.
- [ ] `/signin` — **passkey**: register (WebAuthn) then assert on next visit.
      (`/api/v1/webauthn/register/{options,verify}` + `assert/{options,verify}`)
- [ ] Expired/used magic link → honest error, not a crash.
- [ ] `/onboarding` — 4 steps (business → wallet → verification → first invoice).
      Each step persists; refresh mid-flow resumes correctly; completing it provisions
      the vendor (verify the `vendors` row + wallet).
- [ ] Onboarding wallet step — Circle Wallets / passkey provision; honest if simulated.

---

## 3. Vendor — the core product (logged in)

### 3a. Invoices 💰🔗
- [ ] `/vendor/invoices` — list (empty state, then populated), filters, status badges.
- [ ] `/vendor/invoices/new` — create an invoice (line items, customer, amount) →
      lands on detail; **verify `invoices` row persists**; honest live/sim badge.
- [ ] `/vendor/invoices/[id]` — detail: status timeline, copy hosted-invoice link,
      branding preview, PII (customer email) handling.
- [ ] `/vendor/invoices/[id]/screening` — screening result surface (simulated →
      "manual review", never silently "passed"). 🏷️
- [ ] `/vendor/invoices/import` — bulk import (CSV?) → rows created, error rows
      reported honestly.
- [ ] `/vendor/invoices/recurring` — create a recurring schedule → persists; honest
      about whether it actually fires.
- [ ] Publish on-chain (PublishInvoiceOnChain) — vendor signs; invoice anchored;
      verify tx + DB mirror. 🔗

### 3b. Payment links (Klaro Link) 💰🔗
- [ ] `/vendor/links/new` — create a reusable payment link → persists.
- [ ] `/vendor/links`, `/vendor/links/[id]` — list + detail; deactivate; usage count.

### 3c. Cashout 💰🔗🏷️ (highest-risk flow)
- [ ] `/vendor/cashout` **desktop** — quote builder (amount + corridor), live quote
      refreshes, fee/spread/rate shown; corridor pills show pilot/sim honestly.
- [ ] **With a provisioned wallet** → `RequestCashoutOnChain`: connect wallet →
      approve USDC → `requestAndLock` → row at LOCKED; **verify on-chain order +
      DB row match**. 🔗💰
- [ ] **Without a wallet** → simulated submit is refused in live mode with the honest
      message (not a fake success). 🏷️
- [ ] `/vendor/cashout/[id]` — timeline (locked→claimed→proof→confirmed→released);
      **fiat leg labeled simulated/partner-pending even in live mode**; UTR shows
      "simulated reference" honestly. 🏷️
- [ ] Confirm received → release path (daemon advances; USDC releases on-chain). 💰🔗
- [ ] Open dispute from a cashout → routes to a real dispute case.
- [ ] **Mobile** `/vendor/cashout` — the 6-state machine: quote → live → confirm →
      complete → dispute. Walk each state; "no INR moves" labels present. 🏷️

### 3d. Retainer streams 💰🏷️
- [ ] `/vendor/retainer` — create stream (payer, amount, days) → persists; vesting
      counter renders; **labeled simulated, "no USDC locked on-chain"**. 🏷️
- [ ] Withdraw vested → `withdrawn_usdc` updates; cancel → vested frozen. (verify DB)

### 3e. Agents 💰🏷️
- [ ] `/vendor/agents` — hire an agent (select, amount, brief) → `agent_jobs` row.
- [ ] Advance: Fund → Agent starts → Submit deliverable → Accept+release; each status
      + timestamp persists; **on-chain AgentEscrow labeled partner-pending**. 🏷️
- [ ] `/vendor/agents/[id]/jobs` — job history for an agent.

### 3f. Delegations 🏷️
- [ ] `/vendor/delegations` — issue a scoped session key → `session_keys` row;
      revoke → revoked_at set, drops from list. **"Circle enforcement pending"** label. 🏷️

### 3g. Disputes 💰
- [ ] `/vendor/disputes` — list; `/vendor/disputes/[caseId]` — open a dispute, add
      evidence → status EVIDENCE_SUBMITTED; **vendor can't self-decide** (403). 💰
- [ ] Evidence + the two-table write (dispute + dispute_evidence) persist.

### 3h. Bills (vendor pays someone) 💰🔗
- [ ] `/vendor/bills`, `/vendor/bills/[id]` — pay a bill flow; auth + wallet checks.

### 3i. Team (RBAC)
- [ ] `/vendor/team` — invite teammate (role) → row; change role; remove (soft).
- [ ] Owner self-row logic: owner not wrongly blocked. Role gates enforced.

### 3j. Settings, integrations, exports
- [ ] `/vendor/settings` — branding (name/color/logo) → persists + shows on hosted
      invoice/receipt; logo URL must be https (reject data:/javascript:).
- [ ] `/vendor/integrations/webhooks` — create endpoint → secret revealed ONCE +
      stored encrypted; test-ping delivery; deactivate. 🏷️
- [ ] `/vendor/integrations/erp` — ERP connect (honest: planned/simulated). 🏷️
- [ ] `/vendor/exports` — export data (CSV/PDF) → file downloads, content correct.
- [ ] Read surfaces: `/vendor/reputation`, `/vendor/trust-center`, `/vendor/transit`,
      `/vendor/financing` — render, honest about what's real vs preview.

---

## 4. Buyer / Payer (external, may be logged out) 💰🔗

- [ ] `/i/[id]` hosted invoice — opens for a NON-vendor (no auth); shows vendor
      branding, amount, "Pay with USDC".
- [ ] Pay flow — connect wallet → `acceptAndPay` on-chain → invoice flips to PAID;
      **verify on-chain + the InvoicePaid event → screening → settle pipeline**. 🔗💰
- [ ] `/pay/[slug]` — payment-link pay flow (reusable link).
- [ ] `/receipt/[hash]` — public receipt verifies on-chain ("Verified on Arc"); the
      receipt_hash matches the contract-derived hash (QA-024). 🔗
- [ ] Buyer edge cases: insufficient USDC, wrong chain, rejected signature, already-paid.

---

## 5. LP (liquidity provider) 💰🏷️

- [ ] `/lp` overview + `/lp/walkthrough` + `/lp/disputes-explainer` — render.
- [ ] `/lp/apply` — submit application (legal entity, country, wallet) → persists,
      status DOCS_UPLOADED. (RLS: only this LP sees it)
- [ ] `/lp/docs` — submit KYB docs → UNDER_REVIEW.
- [ ] (operator approves — see §6) → `/lp/stake` — stake USDC → STAKED, tier set;
      **"no USDC pulled on-chain yet, LPStaking partner-pending"** label. 🏷️💰
- [ ] `/lp/queue` — claim a cashout order (must be STAKED + payout wallet set);
      compare-and-swap (two LPs can't both claim). 💰
- [ ] `/lp/settings` — rotate payout wallet → persists; corridor/notif toggles
      honestly "Coming soon" (refuse, don't fake). 🏷️
- [ ] `/lp/dashboard`, `/lp/reputation` — render with real numbers.
- [ ] `/lp/disputes`, `/lp/disputes/[caseId]` — LP-side dispute view + evidence.
- [ ] RLS: an LP cannot see another LP's profile/orders.

---

## 6. Operator / Admin 💰

- [ ] Non-operator hitting `/admin/*` → forbidden (don't leak operator surfaces).
- [ ] `/admin` dashboard — queues, KPIs render.
- [ ] `/admin/disputes` — decide a case (outcome + note). **Live mode: enqueues the
      daemon `DisputeManager.decide`; does NOT fake a DB flip.** Request-evidence
      path. 💰🏷️
- [ ] `/admin/manual-review` + `/admin/risk-holds` + `/admin/sanctions` — screening
      review queue; approve/hold; honest about simulated screening. 🏷️
- [ ] `/admin/case-management`, `/admin/limits` — protocol limits, case ops.
- [ ] `/admin/audit-log` — every operator action recorded (decide, approve, pause).
- [ ] `/internal/kpi` — KPI aggregation renders.
- [ ] `/api/admin/pause` — pause guard (operator-only; honest if refuses on-chain). 💰

---

## 7. API / SDK (programmatic — the partner path)

- [ ] `POST /api/v1/invoices` + `GET /api/v1/invoices/[id]` — create/read via API key.
- [ ] `POST /api/v1/cashouts` + `/api/v1/cashouts/quotes` — quote-hash integrity
      (tampered quote rejected). 💰
- [ ] `POST /api/v1/disputes` — open via API.
- [ ] `POST /api/v1/fx/quotes` — quote returns simulated mode honestly. 🏷️
- [ ] `GET /api/v1/receipts/[hash]` — public receipt verify.
- [ ] `/api/v1/webhooks` — register endpoint via API (vs the dead in-memory Map —
      confirm it uses the live repo). 🏷️
- [ ] `/api/agents/[agentId]/call` — x402 nanopayment 402 negotiation (live vs sim). 🏷️
- [ ] Error classifier: deferred features return **503** (`_not_yet_*`), not 500.
- [ ] Inbound webhooks (`/api/webhooks/{circle,cctp,gateway,stripe,erp}`) — signature
      verification; replay protection; bad signature rejected. 💰
- [ ] `/api/health`, `/api/status`, `/api/openapi` — health + spec accurate.
- [ ] Push: `/api/v1/push/subscriptions`; cron: `/api/cron/lifecycle-reminders`
      (timing-safe auth).

---

## 8. The money-critical end-to-end chains (do these as ONE continuous flow each)

These are the flows where a bug strands real money. Run each start→finish:

- [ ] 💰🔗 **Invoice → paid → settled → receipt**: vendor creates → buyer pays
      on-chain → screening → settle → receipt mints → both see correct state +
      verifiable receipt.
- [ ] 💰🔗 **Cashout start → release**: vendor locks USDC → LP claims → proof →
      vendor confirms → USDC releases to LP. Verify USDC actually moved + every
      DB mirror.
- [ ] 💰🔗 **Dispute → decide → resolve**: open dispute → operator decides →
      DisputeManager.decide → escrow resolveDispute → funds move to the right party.
- [ ] 💰🔗 **Agent job → complete**: hire → fund → deliver → accept → JobCompleted →
      job CLOSED + payout.

---

## 9. BLIND SPOTS — what a UI/feature plan still misses (close these or it's not "perfect")

A screenshot-judge + multi-user plan proves "it looks right and works on screen."
For a **money system** that is necessary but NOT sufficient. These are the categories
that the plan above would *pass* while the system is still broken. Ordered by how
catastrophic the miss is.

### 9.1 💰 DB ↔ chain divergence (the #1 killer)
The screen and the DB can say "RELEASED" while the chain says "LOCKED" (or vice
versa). Every per-flow check confirms one moment; nothing sweeps the whole system.
- [ ] **Reconciliation sweep**: for every escrow order/job/dispute, read on-chain
      status AND the DB row → assert they match. Any drift = P0.
- [ ] **Proof-beats-claims holds everywhere**: the DB must never lead the chain.
      Find any path that writes "done" before the tx confirms.
- [ ] **Receipt hash**: DB `receipt_hash` == contract-derived hash (QA-024 class).

### 9.2 💰 Money conservation & precision
- [ ] **Conservation invariant**: USDC in == USDC out + still-escrowed, across
      invoice/cashout/retainer/agent. Money never created or destroyed (incl. on
      dispute refunds, cancels, expiries).
- [ ] **Fee math**: Klaro fee + LP spread + payout sum to the total — no dust gained
      or lost (FeeSplitter). Check the exact wei/micro.
- [ ] **Precision boundaries**: 6-dec USDC vs display vs `numeric(78,0)` micro vs
      dollar conversions (the LP `staked_usdc` ÷1e6 class). Test 0, 1 micro, max,
      fractional, and a value that round-trips DB→UI→chain unchanged.

### 9.3 💰 Partial-failure & recovery (half-completed money moves)
The plan tests "error → clean message." It does NOT test the dangerous middle:
- [ ] **On-chain succeeds, DB write fails** (and reverse): does it self-heal, or is
      money now stranded/mis-mirrored? Who reconciles?
- [ ] **Daemon down / Redis down / RPC down mid-flow**: job queues but doesn't run →
      user sees honest "processing," and it **completes when the daemon recovers**
      (not stuck forever, not double-run).
- [ ] **Retry idempotency (system-wide)**: BullMQ retries a job → no double-pay, no
      duplicate row. (Unit-tested per worker; verify end-to-end under a forced retry.)
- [ ] **Listener backfill**: Arc event listener was down for an hour → does it catch
      up on missed InvoicePaid/Decided/JobCompleted, or are those events lost forever?
- [ ] **Stuck/expired tx**: tx submitted but never confirms; quote/confirm-window
      expires (`expireUnconfirmed` refunds the vendor). Act exactly at the boundary.

### 9.4 💰 Auth bypass beyond the UI (IDOR / direct calls)
UI gating ≠ security. Attack the server directly:
- [ ] **Direct API/action calls**: call `/api/v1/*` and server actions as the WRONG
      tenant / a non-operator, bypassing the UI. Vendor B advancing vendor A's
      cashout, a non-operator POSTing decide, etc. Must be refused server-side.
- [ ] **RLS write negatives**: not just "can't read" — prove vendor B cannot INSERT/
      UPDATE vendor A's rows (the 0036 missing-write-policy class).
- [ ] **Amount / quote / payload tampering**: forge a cashout/FX/invoice/link payload
      with a mismatched hash or edited amount → rejected.
- [ ] **Replay**: replay a signed link-auth / a webhook / a settled action → rejected
      (nonce/cap/idempotency).

### 9.5 Security hygiene (money product = high value target)
- [ ] **Secret-leak scan**: no private key / webhook secret / session token / service
      key in DOM, console, localStorage, or network payloads (grep the captures).
- [ ] **SSRF on user-supplied URLs**: webhook endpoint URL + brand logo URL — block
      internal/metadata ranges (the audit's SSRF→IMDS class). 
- [ ] **Webhook signature verification**: inbound circle/cctp/gateway/stripe/erp —
      bad/absent signature rejected; replayed delivery rejected.
- [ ] **Inputs**: XSS in invoice memo/customer name/agent brief; SQL/`PGRST` injection
      via filters; oversized payloads.

### 9.6 The "looks live but writes to mock" system-wide sweep 🏷️
The honest-mode gap class, hunted exhaustively (not per-feature):
- [ ] Grep every server action + API route for a path that returns success while
      writing to `mockData` in live mode. Every `*Live()` flag's false-branch must be
      labeled, never silently faked.
- [ ] **Dead/unwired UI**: a button or form that renders but no longer routes to a
      real action (orphaned after a refactor).

### 9.7 Coverage & dead-code audit (find the unknown-unknowns)
- [ ] **Zero-test surfaces**: which of the ~85 routes / 22 actions / 30 API routes have
      NO test at all? (The gap doc said 22/24 actions, 20/26 API routes untested.) List them.
- [ ] **Dead code**: run `knip`/`ts-prune` — unreferenced exports, unreachable branches
      (e.g. the `pass` screening branch that's currently unreachable).
- [ ] **Living regression**: this plan must run in CI and the coverage audit must
      **fail on any new untested surface** — a one-time pass rots immediately.

### 9.8 Fresh-state vs scale (the seeded demo vendor hides both ends)
- [ ] **Brand-new user**: zero invoices, no wallet, first-ever action — empty states,
      first-invoice, wallet-not-provisioned paths (don't only test the seeded vendor).
- [ ] **High volume**: 1,000 invoices → pagination, N+1 queries, RLS query latency,
      a large export. Does the dashboard still load?

### 9.9 Observability & ops (you can't have a "perfect system" you can't watch)
- [ ] **Stuck-money detection**: an order stuck in PROOF_SUBMITTED / a DLQ job / a
      stranded escrow — is there an alert, or does it sit silently?
- [ ] **Sentry/monitoring wired** for the money paths; **audit log complete** (every
      operator + money action recorded); **health checks** real.
- [ ] **Operator runbooks** exist for: dispute resolve, stuck cashout, paused contract.

### 9.10 Device / a11y / locale (real users aren't all on desktop Chrome)
- [ ] **Safari / iOS**: passkey + wallet-connect quirks; PWA install + offline.
- [ ] **Firefox + in-app browsers** (the link a buyer opens from WhatsApp/email).
- [ ] **a11y**: keyboard-only through a full pay flow; screen-reader labels; focus traps.
- [ ] **Locale**: ₹ vs $ formatting, timezones on timestamps, long unicode names.

> **Honest framing:** there is no "perfect system" — there is *"we've hunted every
> category that can lose money or lie to a user, and we monitor for the rest."* §9.1–9.4
> are non-negotiable for a payment product; passing §0–§8 while skipping these means it
> *looks* done and *isn't*. A green §0–§8 with red §9.1–9.4 is exactly how a payment
> startup ships a catastrophe.

---

## 10. 💰 REVENUE & FEE COLLECTION — the money the protocol is *supposed* to keep (P0)

> The plan's L1 / §9.2 only check that the *displayed* Klaro fee matches an on-chain
> split *when a split exists*. Code grounding shows the fee is **never collected** on the
> default paths: invoices settle 100% to the vendor, and cashout releases 100% to the LP.
> The entire revenue model is silently a no-op. These are the most expensive misses on
> the board — verify money actually splits, not just that a number renders.

### 10.1 Invoice 1% fee is never collected on the standard path 💰
- [ ] **Settle a normal (sole-payee) invoice and assert the treasury/FeeSplitter balance
      increased by exactly 1% (FEE_BPS.invoice=100) and the vendor received gross − fee.**
      Source of truth: `InvoiceEscrow.settle` (`InvoiceEscrow.sol:409` — `if (inv.splitsHash
      == bytes32(0))` takes the sole-vendor branch and `safeTransfer(inv.vendor, inv.amount)`
      pays 100% gross; FeeSplitter is never invoked). Today this test FAILS — vendor gets 100%.
- [ ] **Prove `createInvoiceAction` populates `splitsHash` so the fee branch is reachable.**
      Source of truth: `vendor/invoices/new/actions.ts` + `lib/repo/invoices.ts createInvoice`
      — `splitsHash` is an *optional* arg no caller supplies, so `splits_hash` is always null.
      Grep confirms zero `splitsHash`/`splits_hash` references in the create action.
- [ ] **Tie the displayed `lib/pricing.ts` `FEE_BPS.invoice=100` (1.0%) to a real on-chain
      treasury credit** for at least one settled invoice end-to-end (not just the pricing page).
- [ ] **Decision gate, documented:** either the standard invoice path MUST inject a vendor+
      treasury split (so 1% lands in treasury), OR pricing/FAQ must stop claiming a 1% cut.
      One of these must ship before launch — do not leave the revenue model a silent no-op.

### 10.2 Cashout Klaro fee (0.3%) + LP spread are quote-display-only, never withheld 💰
- [ ] **Lock a cashout, advance to release, and assert the LP received `usdcAmount −
      klaroFee − lpSpread` and the treasury received `klaroFee`.** Source of truth:
      `CashoutOrderProcessor.sol` Order struct (`:45-64`) stores only `usdcAmount` + opaque
      `quoteHash` — no fee/spread fields; every payout leg (`:270` release, `:424/431/463`
      resolveDispute, `:488` expire, `:500` cancel) transfers the **full `o.usdcAmount`**.
      Today the LP gets the entire gross; klaroFee + lpSpread are economically inert.
- [ ] **Prove the quote-hash binding is economically meaningful.** `cashoutQuote.ts
      computeQuoteHash` packs `klaroFeeUsdc + lpSpreadUsdc`; `cashout/actions.ts:271` verifies
      the on-chain `quoteHash` matches. But the contract never decodes/enforces those values.
      Assert that the fees the vendor signed over are actually deducted — not just hashed.
      (C2 "tampered quote rejected" passes while this invariant is unenforced.)
- [ ] **Decision gate, documented:** either `CashoutOrderProcessor` must split fee/spread to
      treasury/LP on every payout leg, OR the cashout UI must stop showing a Klaro fee + LP
      spread it does not collect. Ship one before launch.

### 10.3 FeeSplitter dust direction is unverified at the micro level 💰
- [ ] **Add a FeeSplitter.t.sol case for an amount that does NOT divide evenly across the
      bps and assert the exact wei each payee receives.** Source of truth: `FeeSplitter.sol`
      `_distributeToPayees:216` and `distributeAdHoc:190` both assign `last = amount −
      distributed` to `items[n-1]` — dust always lands on the LAST payee. Pin which party
      (vendor vs treasury) that is and confirm it is the intended economic choice.
- [ ] **Cross-check the UI-displayed Klaro fee equals the on-chain treasury cut to the micro**
      for a non-even split — the off-chain `corridors.ts`/`pricing.ts` `Math.round` math can
      disagree with the on-chain dust assignment by a few micro.

---

## 11. 💰 ON-CHAIN MONEY-CORRECTNESS COVERAGE — the invariants are documented but unbacked (P0)

### 11.1 Echidna conservation harness is an unwired stub that reverts 💰
- [ ] **Wire the three Echidna bodies to real state and prove they fail-closed today, pass
      once wired.** Source of truth: `packages/contracts/test/echidna/Targets.sol:34-44` —
      `echidna_invariant_escrow_conservation`, `_cashout_no_double_release`, and
      `_splitter_dust_conservation` all `revert EchidnaHarnessNotWired()`. RetainerStream.sol
      and FeeSplitter.sol NatSpec claim these are "asserted by Echidna on every distribute" —
      that guarantee does not exist.
- [ ] **There are ZERO Foundry `invariant_*` / `StdInvariant` suites anywhere.** Grep
      `function invariant` + `StdInvariant` across `packages/contracts/test` returns nothing.
      Add stateful-fuzz invariant suites for: escrow conservation, cashout no-double-release,
      splitter dust-conservation. The headline money-correctness guarantee for the whole
      system currently rests on coverage that is not implemented.
- [ ] **Run `echidna … --config echidna.yaml` in CI** and gate the launch on a green run that
      actually executed (not a vacuous pass). §9.2's conservation check depends on this.

### 11.2 System-wide cross-flow USDC conservation (all four escrows together) 💰
- [ ] **Build a reconciler/test that reads `usdc.balanceOf(eachEscrow)` and asserts it equals
      the sum of that contract's open obligations**, run after a mixed sequence of flows:
      - InvoiceEscrow: Σ open (PAID, not-yet-settled) invoice amounts.
      - CashoutOrderProcessor: Σ LOCKED/CLAIMED/PROOF_SUBMITTED/DISPUTED order `usdcAmount`
        **plus `pendingSlash`** (a deferred liability that must be accounted).
      - RetainerStream: Σ (deposit − withdrawn − refunded) across live streams.
      - AgentEscrow: Σ FUNDED/STARTED/DISPUTED job `amount + fee` (the held `feeUsdc` is an
        extra balance the sweep must include).
      §9.2 lists "conservation across invoice/cashout/retainer/agent" but no test spans all
      four; a slow leak (dust, stranded fee, double-counted refund) only surfaces in aggregate.

---

## 12. 💰 OFF-CHAIN LEDGER ↔ CHAIN RECONCILIATION & PARTIAL-FAILURE (P0/P1)

> §9.1/§9.3 name these abstractly. Grounding shows the concrete failure shapes below.
> A money OS needs a *standing reconciler + alert*, not the one-time manual sweep the
> plan currently lists.

### 12.1 No standing DB↔chain reconciler exists for any escrow 💰
- [ ] **Confirm no worker/cron periodically reads on-chain `getOrder`/`getInvoice` status
      and reconciles against `cashout_orders.status` / `invoices.status`** (grep the daemon
      for a reconcile loop — none exists). Build one + an alert on drift.
- [ ] **Force the post-tx DB UPDATE to fail and assert a reconciler eventually re-syncs the
      DB to chain truth.** Source of truth: `cashoutAdvancer.ts` release branch does
      `waitForTransactionReceipt` (`:118`) THEN the DB UPDATE — if that UPDATE 5xx's, the
      worker throws and BullMQ retries `operatorConfirmReceived`, which now reverts
      `InvalidStatus` (chain already RELEASED) and the row stays CONFIRMED forever.
- [ ] **Same shape in `screenAndSettle.ts`:** on-chain `settle` succeeds, then the `invoices`
      UPDATE can fail leaving chain=SETTLED, DB=PAID with no compensating reconcile.

### 12.2 Arc listener gap-recovery is implemented but UNTESTED 💰
- [ ] **Prove the persisted-cursor backfill actually recovers a missed event.** Source of
      truth: `arcSubscriber.ts:479-520` DOES persist a Redis cursor
      (`klaro:listener:cursor:<addr>:<event>`) and on restart replays
      `getLogs([cursor+1, latest])` with a `REORG_OVERLAP` re-scan (QA-072). Test: stop the
      listener, fire `acceptAndPay` on-chain, restart, assert the invoice eventually settles.
- [ ] **Test the cursor-loss case:** the cursor lives in **Redis**, not Postgres — if Redis
      is flushed/evicted, the listener re-seeds at `latest` and the gap is lost. Assert this
      is either survivable (durable cursor) or alarmed.
- [ ] **Per-event idempotency under replay:** each event is keyed by `(event,txHash,logIndex)`
      — replay the same log after a forced re-scan and assert no double-enqueue / double-pay.

### 12.3 Terminal-state ledgers do not encode WHO got paid 💰
- [ ] **Cashout refund/expire/cancel/dispute branches:** `CashoutOrderProcessor.resolveDispute`
      pays the LP (RESOLVED_LP_PAYS), the vendor (RESOLVED_VENDOR_PAYS), or splits via slash;
      `expireUnconfirmed`/`cancel` refund the vendor. But `cashouts.ts advanceCashout` only sets
      `status + resolved_at` — `cashout_orders` has no `released_to`/`refunded_to`/amount column.
      Test each terminal branch and assert the DB row alone lets you reconstruct the on-chain
      payee. It cannot today — reconciliation against chain is impossible from the DB.
- [ ] **Agent terminal disposition:** `AgentEscrow.markCompleted` (pay agent + treasury fee) vs
      `cancel` (refund principal) vs `resolveDispute` (one side) — `agentJobs.ts advanceJob`
      sets only `status + timestamp`; `agent_jobs` has no `paid_to`/`fee_collected` field, so a
      CLOSED job cannot distinguish "paid agent + fee" from "refunded principal." Add the
      disposition columns and assert the three money outcomes are distinguishable in the DB.

---

## 13. 💰 LEDGER CONCURRENCY & ATOMICITY (P0/P2)

### 13.1 Retainer withdraw is a non-atomic read-modify-write → double-withdraw 💰
- [ ] **Fire two parallel `withdrawFromStream` calls for the same stream with
      amount == full withdrawable; assert final `withdrawn_usdc` == sum of the SUCCESSFUL
      withdrawals (exactly one must fail).** Source of truth: `retainerStreams.ts:124-128` —
      reads the row, computes `next = withdrawnUsdc + amount`, writes guarded ONLY by
      `.is('cancelled_at', null)` (no conditional on the prior `withdrawn_usdc`). Two
      concurrent requests both read the same base and lost-update: the recipient withdraws
      twice but the ledger advances once. This is the exact CAS race the codebase already
      fixed for `cashouts.advanceCashout` (`.eq('status', fromStatus)`) and `agentJobs.advanceJob`
      — retainer withdraw was left unprotected. Fix with an optimistic predicate
      (`.eq('withdrawn_usdc', prior)`) or a DB-side atomic increment.

### 13.2 Invoice create is non-atomic across two inserts 💰
- [ ] **Force the `invoice_line_items` insert to fail after the `invoices` insert succeeds;
      assert the invoice is rolled back or flagged inconsistent (not left orphaned).** Source
      of truth: `invoices.ts createInvoice:214-243` — two independent inserts, explicit comment
      "Supabase JS doesn't expose true tx … best-effort." The on-chain `metadataHash` is
      computed from the line items, so an orphaned invoice commits to itemization the DB
      doesn't hold.
- [ ] **Add a standing invariant: for every invoice, `Σ(line_items.amount_usdc) ==
      invoices.amount_usdc`.** Run it over the live table as a reconciliation check.

---

## 14. 💰 USDC PRECISION & FLOAT-PATH AUDIT (P1/P2/P3)

> §9.2 names "÷1e6 class" and "test 0/1 micro/max/fractional" abstractly. These pin the
> exact float-contaminated code paths to test.

- [ ] **`quoteCashout` payoutMinor float path** — unit-test with `usdcAmount` near the $1B
      `assertSafeUSDAmount` cap and a high-rate corridor (NGN 1550 / KRW 1360); assert
      `payoutMinor` equals a pure-bigint reference `(netUsdc * rateScaled * 100) / 1e6`.
      Source of truth: `corridors.ts:232-234` — `Math.round((Number(netUsdc)/1_000_000) *
      rate * 100)` casts a 6-dec USDC bigint to a JS double; products overflow precision
      well before MAX_SAFE_INTEGER, so the hashed payout can drift from a re-derivation.
- [ ] **`quoteCashout` fee bigint-from-float** — `Math.round(corridor.klaroFee * 1_000_000)`
      (`:225/228`); assert the API route and the server action round identically for an
      amount that is not a clean fee multiple (no quote/recompute divergence breaking C2).
- [ ] **FX `dstAmount` truncation** — `fxQuotes.ts createFxQuote:78-80` does
      `BigInt(Math.floor(Number(srcAmountUsdc) * rate))`; test a large `srcAmountUsdc` + a
      non-round rate (0.92, 1.087) and assert it equals a bigint reference, with no silent
      truncation above MAX_SAFE_INTEGER. (Persisted `dst_amount` is the "you will receive".)
- [ ] **LP `staked_usdc` round-trip → tier** — `lp/stake/page.tsx:149` seeds the slider with
      `Number(lp.stakedUsdc)/1_000_000`; test a tier boundary ($2000.00, $499.999999) and a
      very large value, assert the micro bigint round-trips DB→UI unchanged AND that tier is
      derived from the bigint, not the lossy display (a slip near a boundary mis-assigns tier).
- [ ] **`formatUSDC` sub-cent truncation** — `money.ts:19-25` floors cents via `(frac*100n)/ONE`,
      so `formatUSDC(1_009_999n)` renders "$1.00" and drops 9999 micro; assert `formatUSDC` is
      NEVER used as the basis for a reconciliation total, and decide round-half-up vs a
      sub-cent indicator for display.

---

## 15. 🔒 RLS WRITE-BOUNDARY NEGATIVES — direct-PostgREST attacks the UI never exercises (P0)

> §9.4 names "RLS write negatives (the 0036 class)" abstractly. These are the concrete
> cross-tenant write attacks, each tied to the exact policy/repo. Run with
> `KLARO_LIVE_DB_TESTS=1` against real PostgREST — server-action tests do NOT cover RLS.

### 15.1 LP claim has NO UPDATE policy on cashout_orders 🔒
- [ ] **Resolve the LP-claim live-mode contradiction.** Source of truth: migration
      `0004_lp_and_cashout.sql:217-218` — `cashout vendor scope` is the only `for all`/UPDATE
      policy (`vendor_id = current_vendor_id() or is_admin()`); the LP policy is **SELECT-only**.
      An LP (different `current_vendor_id()`, not admin) running `claimOrderAction →
      advanceCashout` (writes via `tryDb`) should be RLS-DENIED. Determine which is true:
      (a) the live LP-claim path is silently broken (every cashout strands), or
      (b) something escalates to service-role (LP write bypasses tenant isolation entirely).
      Both are catastrophic. The CAS race the plan tests may only run in mock mode.
- [ ] **As staked LP-B, attempt a direct PostgREST UPDATE on LP-A's already-CLAIMED order →
      must be denied.** If a real LP UPDATE policy is added, prove it is limited to the
      REQUESTED→CLAIMED transition only.

### 15.2 Team role-escalation cross-tenant write 🔒
- [ ] **As vendor B, call `changeRoleAction` / `removeTeammateAction` with a member id
      belonging to vendor A → assert RLS rejects (0 rows affected) and A's team is unchanged.**
      Source of truth: `team.ts changeRole:79-93` / `removeTeammate:95-103` filter on **`id`
      only** — no `vendor_id` predicate; isolation rests ENTIRELY on `0036` `team vendor
      update` WITH CHECK. If that policy regresses or the service-role client is reached, B
      escalates/removes A's staff (tenant takeover / DoS).
- [ ] **Direct PostgREST UPDATE setting `role='owner'` on any cross-tenant row → denied.**

### 15.3 Dispute party self-decide via direct PostgREST 🔒
- [ ] **As the claimant vendor, raw supabase-js UPDATE on the OWN case setting
      `{status:'DECIDED', outcome:'RELEASE_TO_CLAIMANT', decided_at: now()}` → must be RLS-
      rejected.** Repeat as the LP respondent. Source of truth:
      `0039_disputes_party_update_no_self_decide.sql` tightened the WITH CHECK so non-admin
      parties may only land OPENED/EVIDENCE_REQUESTED/EVIDENCE_SUBMITTED with outcome
      null/PENDING and `decided_at` null. The server actions never expose self-decide, so this
      control is provable ONLY by attacking PostgREST directly (D1's UI 403 does not exercise it).
- [ ] **Confirm the legitimate write succeeds:** the same UPDATE limited to
      `status='EVIDENCE_SUBMITTED'` with outcome PENDING is allowed.

---

## 16. 🔒 SERVER-SURFACE SECURITY — controls invisible to UI testing (P1)

### 16.1 Rate limiting does not cover server actions
- [ ] **Fire ~200 rapid `createWebhookAction` / `openDisputeAction` calls in a minute as one
      authenticated vendor and assert they are NOT 429'd (proving the gap), then add a
      per-action throttle.** Source of truth: `middleware.ts:154-174` runs `rateLimit()` only
      inside `if (path.startsWith("/api/"))`; Next server actions POST to the PAGE route
      (`/vendor/*`), which the limiter never sees — the entire money-mutating action surface
      is unthrottled (resource exhaustion, audit/Sentry flooding, relayer gas burn).
- [ ] **Multi-node limit dilution:** the limiter is in-memory per edge node and trusts
      `x-real-ip` (`clientIp()`); effective limit = RATE_LIMIT × node count. Assert a shared/
      durable limiter or document the deploy-topology assumption.

### 16.2 Public link-pay row-materialization + relayer-gas amplification
- [ ] **Invoke `getOrCreateInvoiceForLink` 100× with distinct random buyer wallets for one
      slug; count invoice rows + relayer publish calls; assert per-link/per-IP dedup caps it.**
      Source of truth: `pay/[slug]/actions.ts` is a `"use server"` action callable WITHOUT
      auth; it validates only the buyer wallet format then calls
      `links.ts getOrCreateLinkInvoice` (service-role) which materializes a backing invoice
      and publishes on-chain via the relayer (gas-in-USDC). Distinct wallets each create a row
      → mass row-creation + operator-wallet gas drain. The `/api/*` limiter does NOT cover
      `/pay/<slug>`. Confirm the idempotency key actually dedups (slug,buyerWallet).

### 16.3 Per-principal idempotency-key isolation
- [ ] **Tenant A POSTs `/api/v1/cashouts` with `Idempotency-Key: K` → 201; tenant B POSTs any
      `/api/v1` route with the same K → assert B does NOT receive A's cached body** (no
      `idempotent-replay` of A's data). Repeat with an unauthenticated caller reusing a
      logged-in vendor's key. Source of truth: `api.ts idempotencyCacheKey:20-24` keys on
      `${vendorId|anon}:sha256(key)` precisely to stop cross-tenant response replay — a money-
      API control invisible to UI testing.

### 16.4 WebAuthn assert cannot leak identity or accept confused credentials
- [ ] **Present a credential registered to vendor A against a challenge minted for vendor B →
      expect 403 `credential_vendor_mismatch`.** Replay an assertion with a stale signature
      counter → 401. Assert the 200 body contains NO `vendor_id`/email/session token.
      Expired challenge → `challenge_expired`. Source of truth:
      `api/v1/webauthn/assert/verify/route.ts` (mismatch check ~`:78`, response ~`:135` returns
      only `{verified:true}` — returning `vendor_id` would be an ATO primitive). Endpoint is
      unauthenticated; a refactor that returns the id or skips the mismatch check is a takeover.

### 16.5 Inbound-webhook replay window + IMDS-redirect + duplicate-delivery
- [ ] **(1)** Inbound webhook with `t` older than 300s → reason `replay_window`.
- [ ] **(2)** Replay an identical valid delivery within the dedup TTL → `duplicate_delivery`.
- [ ] **(3)** Signature of wrong hex length → `signature_mismatch`, not a 500.
- [ ] **(4)** Stand up an endpoint that 302-redirects to a private IP → `deliver()` throws the
      SSRF-redirect error and never fetches the target.
      Source of truth: `webhookVerify.ts` (5-min window + Redis SET-NX dedup over
      `${t}.${rawBody}`) + `webhooks.ts deliver:89-101` (`redirect:"manual"`, refuses 3xx). A
      regression in any one (shorter dedup TTL than window, re-added redirect following)
      silently reopens replay/SSRF. §7/§9.5 hand-wave "replay protection"; enumerate each.

### 16.6 Brand-logo URL bypasses the SSRF guard the webhook URL has
- [ ] **Store `http://169.254.169.254/...` / `http://localhost:6379` as the brand logo and
      confirm whether any server-side path fetches it** (`lib/walletPass.ts`, OG/receipt PDF
      routes). Source of truth: `vendor/settings/actions.ts:20` validates `brandLogoUrl` with
      only `/^https?:\/\//` — it does NOT call `assertPublicHttpUrl`, unlike
      `webhooks/actions.ts:48-56`. If any server consumer fetches it, this is the IMDS class
      the webhook guard exists to stop. Add `assertPublicHttpUrl` to the branding action.

### 16.7 Stored-XSS on free text under the permissive embeddable CSP
- [ ] **Inject `<img src=x onerror=alert(document.cookie)>` and `<script>` into invoice
      `notes_md`, customer name, dispute opening note, agent brief, branding displayName;
      load `/i/[id]`, `/receipt/[hash]`, `/pay/[slug]`, dispute/admin views → confirm escaped
      (no execution).** Source of truth: `middleware.ts` CSP ships
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (no XSS defense-in-depth) and these
      pages serve `frame-ancestors *`. `get_public_invoice` returns `notes_md` verbatim —
      verify sanitization AT the render site; grep for `dangerouslySetInnerHTML` + any markdown
      renderer that allows raw HTML.

### 16.8 Mock-auth fail-closed in production
- [ ] **With `NODE_ENV=production` and Supabase env unset, assert `getCurrentSession()` returns
      `null`** and `/admin/*` + `requireOperator()` refuse. Source of truth: `auth.ts:30-44` —
      `getCurrentSession` falls back to `mockGetCurrentVendor()` granting `role:"operator",
      simulated:true` whenever `supabaseLive()` is false; the ONLY guard is
      `mockFallbackAllowed()` = `!IS_PROD || KLARO_ALLOW_MOCK_AUTH`. A misconfigured prod deploy
      (Supabase down/typo'd env) would otherwise grant every anonymous visitor a full operator
      session over the admin console + LP approvals + dispute decide.
- [ ] **Assert that if `KLARO_ALLOW_MOCK_AUTH` is unintentionally `1` in prod, an alert/guard
      fires.** Confirm NO env permutation grants operator to an anonymous prod caller.

### 16.9 Magic-link enumeration + open-redirect allowlist
- [ ] **Confirm the post-auth `redirectTo` is clamped to the (empty) partner allowlist** via
      `resolveSafeRedirect`, so a magic link cannot hand off to `evil.com` (auth-code theft);
      and that OTP issuance routes through the edge rate limiter. Source of truth:
      `api/auth/magic/route.ts`. Test an off-allowlist `redirectTo` → stripped to a safe
      default; confirm account-enumeration responses are uniform (no "user exists" oracle).

---

## Critic-gap grounding (verified against the real tree before merging)

Every critic finding below was confirmed in source. Corrections applied where the critic/plan over- or under-stated:
- **Privileged-key blast radius — CONFIRMED.** `CashoutOrderProcessor.sol` — `claimByLP`(:361), `recordProof`(:383/401), `expireUnconfirmed`(:476), `retrySlash`(:314) are `onlyOperator`; `pause`(:506)/`unpause`(:510)/`setOperator`(:516)/`setDisputes`(:349) are `onlyOwner`. Contract is `Ownable2Step` (:27) — so the pending-owner two-step exists and the gate must verify the owner is a multisig, not an EOA. Daemon signs with a single raw env key (`apps/daemon/src/arc.ts:43-45` `privateKeyToAccount(DAEMON_OPERATOR_PRIVATE_KEY)`).
- **Financial limits — CONFIRMED, with correction.** Not purely "decorative": `lib/repo/protocolLimits.ts` is a real seeded display table (daily cashout cap, corridor cap) and the schema HAS backing columns (`vendors.max_cashout_usdc_daily`, `lp_profiles.daily_max_usdc`). But `vendor/cashout/actions.ts` performs **zero** limit/cap/velocity enforcement (no `listProtocolLimits`, no `max_cashout_usdc_daily` read, only `assertSafeUSDAmount`'s $1B sanity cap in `money.ts:48`). So the limits render in `/admin/limits` and exist as columns but are never checked on the money path.
- **Audit-log durability — CONFIRMED.** `auditLog.ts` — `record()` pushes to in-memory `_ring`(:93), `recent()`/`filterBySubject()` read that ring(:136-147, lost on restart), and `appendAudit()` is fire-and-forget `.catch()`-swallowed(:118-131). No rollback on durable-write failure; no append-only/WORM guarantee.
- **Config-drift — CONFIRMED.** Three independent address sources: web `env.ts:93/108`, daemon `env.ts:33/35` (`z.string().optional()`), Deploy.s.sol broadcast. No cross-check, no chainId pin, no bytecode-vs-source verification anywhere.
- **LP-float solvency — CONFIRMED.** `cashouts.ts` claim path has NO stake/exposure predicate (grep returns nothing); `CashoutOrderProcessor` references stake only in slash comments. An LP can claim with stake < exposure.
- **Upgradeability — CONFIRMED, with correction.** No UUPS/Initializable/proxy/delegatecall anywhere in `packages/contracts/src` (non-upgradeable), YET `auditLog.ts:40` defines a `contract.upgrade` action code — a real inconsistency to resolve.
- **Relayer-gas DoS — CONFIRMED.** Zero `balanceOf`/`gas-balance`/`low-balance`/`refill`/`minGas` guard in the entire daemon. No graceful-degradation floor.
- **DR / Redis durability — CONFIRMED.** Listener cursor lives in Redis only (`arcSubscriber.ts:479-520`); no PITR/RPO-RTO gate exists.

---

## 17. ⛓️ ON-CHAIN GOVERNANCE, KEY CUSTODY & DEPLOYMENT INTEGRITY (P0)

> §9 and §10–17 cover money math, ledger↔chain drift, and web auth. They never gate the
> **single largest catastrophic surface for a real-money launch: the on-chain privileged
> keys and the deployment manifest.** One hot key signs every money move; one owner key
> can repoint the operator/treasury and unpause-then-drain. None of that is in Gates A–G.

### 18.1 Privileged-key blast radius (single operator hot key) 💰
- [ ] **Quantify the operator-key blast radius and require a control.** Source of truth:
      `CashoutOrderProcessor.sol` — `operatorConfirmReceived`(:251 `onlyOperator`), `claimByLP`
      (:361), `recordProof`(:383/401), `expireUnconfirmed`(:476), `retrySlash`(:314) are ALL
      `onlyOperator`; `InvoiceEscrow.settle`/`recordScreening` are `onlyOperator`. The daemon
      signs them all with ONE raw env key (`apps/daemon/src/arc.ts:43-45`). A leaked operator
      key can unilaterally release/refund/slash **any** order. Negative test: with the operator
      key alone, `operatorConfirmReceived` every LOCKED order and confirm there is no on-chain
      velocity/rate guard or per-order co-sign stopping a full drain.
- [ ] **Gate the key-custody model, documented + tested:** operator key in KMS/HSM (not a flat
      env var); define + test key rotation (`setOperator` to a fresh key mid-flight, assert
      in-flight orders still resolve and the old key is dead); document leak-response runbook.

### 18.2 Owner authority must be a timelocked multisig, not an EOA 💰
- [ ] **Verify the `Ownable2Step` pending-owner / current owner of every fund-holding contract
      is a multisig + timelock, not a deployer EOA.** Source of truth: `CashoutOrderProcessor.sol`
      `is … Ownable2Step`(:27), constructor `Ownable(msg.sender)`(:178); `setOperator`/`setDisputes`/
      `setTreasury`/`setFeeReceiver`/`pause`/`unpause` are all `onlyOwner` across ~20 contracts.
      Owner can repoint the operator/treasury/fee-receiver and unpause-then-drain. Assert the
      owner is the intended custody address on-chain and that ownership transfer is two-step
      accepted (no dangling pending owner).

### 18.3 Contract upgrade posture is undeclared — and `contract.upgrade` audit code is unexplained 💰
- [ ] **Declare and test the upgrade posture per fund-holding contract.** Source of truth: no
      UUPS/Initializable/proxy/delegatecall exists in `packages/contracts/src` (escrows appear
      **immutable**), yet `auditLog.ts:40` defines a `contract.upgrade` action code. Resolve the
      contradiction: if immutable, confirm `setOperator`/`setDisputes`/`setTreasury` cannot
      redirect escrowed funds and document the pause+migrate incident playbook (no in-place
      bug-fix path = a discovered flaw freezes funds); if any logic-swap path exists, prove its
      authority is timelocked multisig and a malicious swap is blocked/delayed. Remove or wire
      the dangling audit code so the audit trail can't claim an upgrade that can't happen.

### 18.4 Deployment-integrity manifest (config-drift across web / daemon / chain) 💰
- [ ] **Pre-launch on-chain assertion for every address the app signs against.** Source of truth:
      web `env.ts:93` `NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS` / `:108` `…CASHOUT_ORDER_PROCESSOR_ADDRESS`
      and daemon `env.ts:33/35` are **independent optional env vars** with no cross-check. For
      each: confirm the address is a contract (non-EOA, `eth_getCode` non-empty), its owner/operator
      == the intended custody key (18.1/18.2), it is NOT paused at launch, and its deployed
      bytecode hash == the verified/audited build. Cross-check web vs daemon vs Deploy.s.sol
      broadcast artifact agree on EVERY address AND chainId (5042002). Any mismatch = NO-GO —
      a UI pointed at contract A while the daemon signs contract B strands funds while every
      screen "looks live." §9.6 catches mock-vs-live; this catches real-vs-real drift.

---

## 18. 💸 COUNTERPARTY, LIQUIDITY, LIMITS, GAS & DISASTER RECOVERY (P0/P1)

### 19.1 LP-float solvency invariant (the core counterparty risk) 💰
- [ ] **Require stake ≥ corridor exposure at claim time and prove it.** Source of truth: the
      cashout model escrows the VENDOR's USDC and pays the LP the full `o.usdcAmount` on release,
      while the LP funds the fiat leg off-chain (C4/C6 simulated/partner-pending). `cashouts.ts`
      claim path has **no stake/exposure predicate at all** — an LP can claim an order larger than
      its stake. Test: a staked LP whose stake < order exposure attempts a claim → must be refused;
      assert `pendingSlash + stake` actually covers a defaulted obligation.
- [ ] **Simulate LP default and prove the vendor is made whole.** LP claims, never submits proof
      → assert the timeout/`expireUnconfirmed`/slash/refund path resolves (the F1 stuck-money
      alert detects the stall but there is no *economic* resolution path tested). Until the fiat
      leg is live, gate LP solvency explicitly as PARTNER-PENDING with the counterparty risk
      documented — not merely "simulated label present."

### 19.2 Slashing economics — correct party, idempotent, bounded 💰
- [ ] **Foundry/integration test per dispute outcome that the slash hits the CORRECT party and
      clears `pendingSlash` exactly once.** Source of truth: `CashoutOrderProcessor` `retrySlash`
      (:314 `onlyOperator`) + `pendingSlash` (deferred liability per §11.2 sweep). Assert
      `RESOLVED_LP_PAYS` slashes the LP, `RESOLVED_VENDOR_PAYS` does not, and a split routes
      correctly; fuzz `retrySlash` for idempotency (no double-slash); assert slash is **capped
      at available stake** (the :436 comment says a hot key "must not drain an LP's whole stake"
      — prove the bound); negative-test an operator-initiated slash against a clean order →
      rejected by state guards. Wrong-party / double slash moves real money to the wrong account.

### 19.3 Financial velocity / per-vendor / per-corridor limits are NOT enforced 💰
- [ ] **Prove whether the seeded limits are enforced or display-only, then enforce them.** Source
      of truth: `lib/repo/protocolLimits.ts` renders daily-cashout + corridor caps and the schema
      HAS `vendors.max_cashout_usdc_daily` (`0002:78`) + `lp_profiles.daily_max_usdc` (`0004:54`),
      but `vendor/cashout/actions.ts` performs **no** cap/velocity check (only `assertSafeUSDAmount`'s
      $1B sanity cap, `money.ts:48`). Test: a cashout exceeding the configured daily/corridor cap
      via the server action AND direct API → must be refused server-side; assert the N+1th tx is
      blocked. Add a new-account cooling/throttle (no first-N-days ceiling exists). Unenforced
      limits on an INR-corridor stablecoin product = fraud blast-radius + an AML/structuring
      control regulators expect. If still unenforced at launch, this is a NO-GO line.

### 19.4 Audit-log durability, fail-closed, and immutability 💰
- [ ] **Force `appendAudit` to fail and assert the operator action is hard-blocked or rolled back,
      not silently completed.** Source of truth: `auditLog.ts:118-131` — the durable Supabase write
      is fire-and-forget `.catch()`-swallowed, so `dispute.decide`/`lp.slash`/`contract.pause`
      already succeeded with NO durable trail and only a Sentry error.
- [ ] **Restart the app and confirm the admin audit UI reads the durable `audit_logs` table, not
      the in-memory ring.** Source of truth: `recent()`/`filterBySubject()` (:136-147) read `_ring`,
      lost on every deploy/restart.
- [ ] **Prove `audit_logs` is append-only.** Attempt a direct PostgREST UPDATE/DELETE on an audit
      row → must be denied even to a service-role writer; ideally a hash-chain or external WORM.
      For a money product this is the compliance spine.

### 19.5 Relayer gas-balance floor & attacker-driven gas burn 💰
- [ ] **Add a low-gas-balance alert + graceful-degradation floor; prove the daemon queues (not
      fail-flips the DB) when the relayer is near empty.** Source of truth: the operator wallet is
      ~8 USDC and gas is paid in USDC on Arc; there is **zero** `balanceOf`/`gas-balance`/`refill`/
      `low-balance` guard anywhere in the daemon. Every auto-signing path — `screenAndSettle` on
      each `InvoicePaid`, `recordScreening`, link-invoice publish, listener backfill re-`getLogs` —
      can be driven by a funded attacker spamming tiny invoices/payments until the relayer drains
      and ALL legitimate money movement halts.
- [ ] **Cap auto-publish per vendor and verify the listener-backfill replay cannot be weaponized
      to re-burn gas on a forced re-scan.** Model attacker event-volume vs operator USDC burn.

### 19.6 Backup / disaster-recovery / RPO-RTO for the off-chain ledger + Redis state
- [ ] **Run a restore drill and prove no money is double-moved or stranded.** Source of truth:
      §12.2 notes the Arc listener cursor lives only in Redis; there is no broader DR gate — no
      Supabase PITR/restore drill, no defined RPO/RTO, no test of a full Redis loss (cursor + all
      in-flight BullMQ jobs + rate-limiter + idempotency cache). Drill: snapshot → simulate Redis
      total loss + DB restore to T−5min → assert the reconciler (Gate B1) re-syncs DB to chain
      truth and no money is double-paid or lost. Define RPO/RTO. Confirm in-flight BullMQ jobs are
      durable or idempotently replayable after Redis loss.

### 19.7 RPC / chain-trust resilience (single-endpoint, no failover)
- [ ] **Verify behavior under a lying/stale/down RPC and add a redundancy or honesty control.**
      Both web and daemon read chain truth from a single configured Arc RPC; a stale `eth_getCode`/
      `getOrder`/`waitForTransactionReceipt` (or a malicious/forked endpoint) feeds the reconciler
      and listener bad truth, making "proof beats claims" trust a single untrusted source. Test:
      RPC returns a stale block / times out mid-`waitForTransactionReceipt` → flow shows honest
      "pending," never a fake "done," and the reconciler does not act on stale reads.

---

## 19. 🚦 LAUNCH-READY GATE — the single authoritative go/no-go (54 checks)

> **Verdict rule: GO only when every Gate A–E + H + I line (P0) is green; any single red P0 line is an automatic NO-GO; Gates F–G red downgrade to a monitored soft-launch, not full GA**
>
> Supersedes every earlier gate list. "Green" = proven against the source of truth
> (DB row / on-chain read / contract test) + a recorded proof — never "the screen looked right."

### Gate A — Money correctness (P0)
- [ ] **A1** — Echidna conservation harness wired + a green CI run (no EchidnaHarnessNotWired stub revert)
- [ ] **A2** — Foundry invariant_* suites exist for escrow conservation, cashout no-double-release, FeeSplitter dust-conservation, and pass
- [ ] **A3** — System-wide conservation proven: Σ usdc.balanceOf(escrows) == Σ open obligations across invoice+cashout+retainer+agent (incl. pendingSlash + held agent fee)
- [ ] **A4** — Invoice 1% fee resolved: it lands in treasury on the standard path OR pricing/FAQ stops claiming a cut (no silent no-op revenue model)
- [ ] **A5** — Cashout klaroFee + lpSpread resolved: withheld on-chain on every payout leg OR the UI stops showing fees it doesn't collect
- [ ] **A6** — Retainer withdraw is CAS-atomic; two concurrent full withdrawals cannot double-pay the ledger
- [ ] **A7** — Every terminal money state (cashout release/refund/expire/cancel/dispute; agent complete/cancel/dispute) records who got paid + how much in the DB
- [ ] **A8** — No money button can double-submit a second row/tx (idempotent end-to-end)
- [ ] **A9** — Slashing hits the CORRECT party per dispute outcome, clears pendingSlash exactly once, retrySlash is idempotent, and slash is capped at available stake (operator cannot slash a clean order)
- [ ] **A10** — A leaked operator key cannot unilaterally drain all LOCKED orders without an on-chain velocity/rate guard or per-order co-sign (blast radius quantified + bounded)

### Gate B — Ledger ↔ chain integrity (P0)
- [ ] **B1** — A standing reconciler reads on-chain status vs DB for every escrow and alerts on drift
- [ ] **B2** — On-chain-success + DB-write-failure self-heals (cashout release + invoice settle); money never stranded or mis-mirrored
- [ ] **B3** — Listener gap-recovery proven end-to-end (stop → event fires → restart → flow completes); Redis cursor loss is survivable or alarmed
- [ ] **B4** — BullMQ retry of any money worker is idempotent under a forced retry (no double-pay)
- [ ] **B5** — Receipt receipt_hash == contract-derived hash for a freshly minted receipt
- [ ] **B6** — Behavior under a stale/lying/down RPC is honest (pending, never fake-done) and the reconciler does not act on stale chain reads

### Gate C — Auth & security (P0)
- [ ] **C1** — LP-claim RLS resolved: legitimate LP claim works AND a cross-tenant LP write is denied (no service-role escalation, no broken claim path)
- [ ] **C2** — Cross-tenant team role-escalation/removal denied by RLS (proven via direct PostgREST, not just the UI)
- [ ] **C3** — Dispute self-decide denied by RLS WITH CHECK (direct PostgREST, both claimant and respondent)
- [ ] **C4** — WebAuthn assert never returns a vendor identity; credential/challenge mismatch, replay, and expiry are rejected
- [ ] **C5** — Mock-auth fail-closed: prod + Supabase-unset yields NO session; no env permutation grants an anonymous prod caller operator role
- [ ] **C6** — Per-principal idempotency isolation: tenant B / anonymous caller cannot replay tenant A's cached authenticated response
- [ ] **C7** — Server actions are rate-limited (or an explicit throttle exists); public link-pay cannot be looped to mass-create rows / drain relayer gas
- [ ] **C8** — SSRF guard applied to BOTH webhook URL AND brand-logo URL (internal/metadata ranges blocked)
- [ ] **C9** — Inbound webhooks reject stale/replayed/malformed signatures and never follow a 3xx redirect to a private IP
- [ ] **C10** — No stored-XSS executes on /i/[id], /receipt/[hash], /pay/[slug], or dispute/admin views (free text escaped despite the permissive CSP)
- [ ] **C11** — Magic-link redirect is allowlist-clamped (no open redirect) and OTP issuance is rate-limited

### Gate D — Honest-mode / source-of-truth (P0)
- [ ] **D1** — Every simulated/partner-pending leg is labeled truthfully on every surface (cashout fiat, retainer vesting, FX demo, LP staking, delegations, agent escrow, screening manual-review never silent auto-pass)
- [ ] **D2** — No path returns success while writing to mockData in live mode; no dead/unwired button routes to a removed action (§9.6 sweep clean)
- [ ] **D3** — Displayed amounts/fees match the source of truth to the micro (no float drift between quote, quoteHash, and on-chain movement; formatUSDC never used for reconciliation totals)

### Gate E — Functional completeness & coverage (P0)
- [ ] **E1** — Every feature-inventory row A1–L8 has a recorded proof (audited screenshot + DB/on-chain read); any row without proof = NO-GO
- [ ] **E2** — All 7 multi-user matrix flows pass with real isolated contexts, including the LP-claim race (exactly one winner, clean already-claimed for the loser)
- [ ] **E3** — All four §8 money-critical end-to-end chains run start→finish with verified fund movement
- [ ] **E4** — Tenant isolation proven: vendor A's invoice/cashout/dispute id is inaccessible to vendor B (404/forbid, never leak) — UI-poke AND direct API/action
- [ ] **E5** — Every /vendor/* /lp/* /admin/* route redirects to /signin when logged out (no 500); non-operators forbidden everywhere on /admin/*
- [ ] **E6** — Quote-expiry, insufficient-balance, wrong-chain, rejected-signature, and daemon-down states each show an honest, recoverable message (no crash, no fake done)

### Gate H — On-chain governance, key custody & deployment (P0)
- [ ] **H1** — Owner of every fund-holding contract is a timelocked multisig (not a deployer EOA); Ownable2Step ownership is two-step accepted with no dangling pending owner
- [ ] **H2** — Operator signing key is in KMS/HSM (not a flat env var); key rotation tested (setOperator to a fresh key mid-flight resolves in-flight orders; old key dead); leak-response runbook exists
- [ ] **H3** — Upgrade posture declared per fund-holding contract: if immutable, setOperator/setDisputes/setTreasury proven unable to redirect escrowed funds + pause/migrate playbook documented; if any logic-swap exists, its authority is timelocked multisig and a malicious swap is blocked; the dangling contract.upgrade audit code is removed or wired
- [ ] **H4** — Deployment-integrity manifest: every web + daemon address is a contract (non-EOA), owner/operator == intended custody key, not paused at launch, bytecode == audited build, and web/daemon/Deploy broadcast agree on every address + chainId 5042002

### Gate I — Counterparty, liquidity, limits, gas & DR (P0/P1)
- [ ] **I1** — LP-float solvency enforced: a claim requires stake ≥ corridor exposure (refused otherwise); an LP default (claim-then-no-proof) resolves via timeout/slash/refund and makes the vendor whole, OR LP solvency is explicitly gated PARTNER-PENDING with documented counterparty risk
- [ ] **I2** — Per-vendor daily, per-corridor, and new-account velocity limits are ENFORCED server-side on the money path (server action AND direct API), proven by a blocked N+1th tx — not merely rendered in /admin/limits
- [ ] **I3** — Audit log is durable + fail-closed + append-only: appendAudit failure hard-blocks/rolls back the operator action (not fire-and-forget swallowed); admin UI reads the durable audit_logs table after restart; direct PostgREST UPDATE/DELETE on an audit row is denied (hash-chain/WORM ideal)
- [ ] **I4** — Relayer gas: a low-balance alert + graceful-degradation floor exists (daemon queues, never fail-flips the DB, when near empty); auto-publish is per-vendor capped; attacker event-volume cannot drain the operator wallet and halt all money movement; listener-backfill re-scan cannot be weaponized to re-burn gas

### Gate F — Operability & disaster recovery (P1)
- [ ] **F1** — Stuck-money detection: order stuck in PROOF_SUBMITTED, a DLQ job, or a stranded escrow raises an alert (not silent)
- [ ] **F2** — Sentry/monitoring wired on all money paths; /api/health + /api/status are real not hardcoded
- [ ] **F3** — Operator runbooks exist for dispute resolve, stuck cashout, paused contract, operator-key leak, and relayer gas refill
- [ ] **F4** — Disaster-recovery drill passes: defined RPO/RTO; full Redis loss + DB restore to T−5min re-syncs via the reconciler with no double-move or stranded money; in-flight BullMQ jobs durable or idempotently replayable
- [ ] **F5** — This plan runs in CI and the coverage audit FAILS on any new untested route/action/API (a one-time pass rots immediately)

### Gate G — Reach: device / a11y / locale (P1)
- [ ] **G1** — Passkey + wallet-connect verified on Safari/iOS; PWA install + offline work
- [ ] **G2** — A buyer can open /i/[id] and /pay/[slug] in Firefox and an in-app (WhatsApp/email) browser
- [ ] **G3** — Keyboard-only path through a full pay flow; screen-reader labels present; no focus traps
- [ ] **G4** — Locale correctness: ₹ vs $ formatting, timezone-correct timestamps, long-unicode names render

## How to run this

- **Manual**: log in as the test vendor on `:3100`, walk each section, file bugs.
- **Scripted human-like**: extend the `apps/web/e2e/fixtures/rabby/pb-*.ts` harness
  (real magic-link session, drives the real UI, verifies live DB rows) — already
  proven for agents/delegations/retainer/fx/lp/cashout-fiat.
- **Live on-chain**: the funded operator wallet (~8 USDC on Arc testnet) can run the
  scoped money-move proofs in §8.

File each bug as: route · persona · steps · expected · actual · severity (💰 = P0).

---

# §20 — LAUNCH-READY STATUS (2026-06-01)

> Source: 7-agent adversarial launch-readiness audit (contracts / daemon workers / web
> journeys / simulated features / test gaps / 54-check gate + ops). Reconciled against
> the live repo. Honest framing — a script *existing* is not proof it *passed*.

## Verdict & grade

- **Overall: C+ / ~45% launch-ready.** Engineering of the on-chain primitives + the
  honesty discipline (every unreal leg is flag-gated + `[SIMULATED]`, no silent
  fake-success) is strong (B+ at the unit/contract layer). But "launch-ready end-to-end"
  is graded on proven fund-movement + custody + isolation + ops, and there it collapses.
- **Honestly-labelled testnet DEMO (no real user funds): B− / ~70% — close.**
- **Mainnet / moving real USDC: D / NO-GO.**
- **Single biggest gap is not a feature — it's custody/key/economic safety** (single raw
  env hot key, EOA contract owner, fire-and-forget audit log, no velocity/AML limits, no
  LP-solvency predicate, unthrottled server actions + `/pay`).
- Test counts at audit: **528 forge / 121 web / 65 daemon green.**

## ✅ PROVEN end-to-end (durable evidence in-repo)

1. **Klaro Link** — the ONLY flow with a committed passing artifact: `apps/web/e2e/.pb-link.log`
   ends `LINK_E2E_OK=true` with on-chain `status 3` + real tx hashes; backed by
   `qa-link-onchain.mjs` (asserts vendor delta == amount) + the 2-wallet UI E2E `pb-link.ts`.
2. **Contract-layer correctness** of every core money state machine — 528 Foundry tests
   (InvoiceEscrow, CashoutOrderProcessor incl. the new on-chain `klaroFee` carve + fail-closed
   `FeeReceiverUnset`, DisputeManager, AgentEscrow, RetainerStream conservation fuzz, LPStaking,
   AuditReceipt). Proves correctness *in isolation*, not that the live addresses were driven E2E.
3. **FeeSplitter value-conservation invariant (I3)** — the one live `StdInvariant`, 256×128k calls, 0 reverts.
4. **Daemon money-mover honesty invariants** at the unit level — cashoutAdvancer (SIMULATED-proof-
   never-advances), screenAndSettle (never auto-settles while simulated), disputeDecide/resolver, reconciler.
5. Cashout happy-path + dispute-resolve were driven viem-direct (3 wallets) — **but against the
   OLD fee-free COP `0x4047…226c` with `klaroFee=0n`, no committed tx-hash artifact** → credible, not durably proven.

## 🔨 BUILD-LEFT (not real yet — code/feature work)

- **A4 (silent revenue no-op):** standard invoice path pays 100% gross to the vendor
  (`InvoiceEscrow.sol:409`) while `pricing.ts` still advertises 1% — inject a vendor+treasury
  split on the default path, or drop the 1% claim.
- **A7:** add terminal-money disposition columns (`released_to`/`amount_paid`/`fee_collected`/`refunded_to`) to `cashout_orders` + `agent_jobs`, populated on every terminal transition.
- **A10/H2:** on-chain velocity / per-order co-sign guard so a leaked operator key can't drain every LOCKED order.
- **I1:** LP-float solvency — enforce stake ≥ corridor exposure at claim + a make-whole path, or gate PARTNER-PENDING.
- **I2:** enforce per-vendor daily / per-corridor / new-account velocity+AML caps server-side (schema cols exist; `cashout/actions.ts` reads zero caps).
- **I3:** durable append-only audit log — `appendAudit` is fire-and-forget into an in-memory ring; point the admin UI at `audit_logs`, hard-block on failure, deny-UPDATE/DELETE RLS.
- **I4/C7:** rate limiter only covers `/api/*` — server actions + public `/pay` are unthrottled; add a durable Redis-backed limiter + gas floor + auto-publish caps.
- **C1 (live-mode strander):** the only `cashout_orders` UPDATE policy is vendor-scoped, so a staked LP's RLS-respecting UI claim would be DENIED → cashouts strand. Add an LP UPDATE policy or daemon-route the claim.
- **Contract invariants I1/I2/A1/A2/A3:** wire the Echidna `escrow_conservation` + `cashout_no_double_release` bodies (still `revert EchidnaHarnessNotWired`) + StdInvariant suites for InvoiceEscrow conservation & cashout no-double-release.
- **All `[SIMULATED]` surfaces needing an EXTERNAL ACCOUNT** (see §below + Ops): screening, fiat payout, FX, ERP, agents custody, retainer funding, session keys, card on-ramp, wallet passes.

## 🧪 TEST-LEFT (built but not proven end-to-end)

1. **Re-prove cashout against the LIVE fee-bearing COP `0x347935…`** with a NON-ZERO `klaroFee`
   (3-wallet drive + `pb-cashout.ts` UI E2E), assert LP delta == amount−fee, fee→receiver, escrow→0,
   capture tx hashes. *(BUILD_LOG claims a real 0.997/0.003 split but no committed script reproduces it
   — the throwaway proof script was deleted. This is the cheapest way to restore a true proof.)*
2. Invoice **create→publish→pay→settle→receipt as one chained on-chain run against the CURRENT escrow**
   (`qa-pay/settle` scripts hardcode a stale escrow `0xF5Cfe431…` ≠ DEPLOYMENT `0xA76edAd6…`); assert `receipt_hash` == contract-derived.
3. **RUN the authored-but-never-run E2E fixtures** after applying their live migrations: `pb-disputes.ts` (0036/0039), `pb-team.ts` (0034/0036), `pb-webhooks.ts` (0035 + vault) → capture `*_E2E_OK=true`.
4. **Daemon real-fund dispute paths** — `advanceDisputeDecide` + `advanceDisputeResolution` are routing/ABI smoke-only (random caseIds → simulate-revert→skip, by their own headers); drive a funded dispute lifecycle so the daemon lands a real decision + moves real USDC.
5. **Tenant-isolation negatives** — add `TEST_VENDOR_B`, prove cross-tenant read/write DENIED for cashout_orders/agent_jobs/disputes/invoices/team + direct-PostgREST self-decide attacks.
6. **True concurrency** — `Promise.all` race: exactly one of two simultaneous LP claims / advances / resolves wins against live Postgres CAS+RLS; daemon signs once.
7. **HTTP boundary tests (0 route tests today)** — `/api/v1/cashouts|disputes|invoices`, `/api/agents/[id]/call` (402/503 money guard), `/api/admin/pause`, `/api/auth/magic` (replay/rate-limit).
8. **Verified-webhook side effects** — CCTP/Circle/Gateway routes wire NO `onVerified` handler (a verified inbound settlement is a no-op); wire + test ledger change + duplicate-event idempotency.
9. **Honest-mode UI sweep + auth/route crawl + error-state drive + XSS on `/i,/receipt,/pay` + SSRF on brand-logo** (only `/^https?/` regex, not `assertPublicHttpUrl`).
10. **Reconciler robustness** — mixed-batch partial-RPC-failure, CAS-loses-to-concurrent-write, forced post-tx-DB-failure self-heal, BullMQ retry-exhaustion→DLQ+alert.
11. **Multi-currency** — the cashout is one on-chain mechanism across corridors (INR/BRL/MXN/PHP/KES/NGN/EUR…); only rate + fiat partner differ, and ALL have `realFiatMoves:false`. TEST: quote→fee→lock→release across 2–3 corridors (rate/fee math per currency) + the StableFX USDC↔EURC swap (`pb-fx.ts` + `stableFxAdapter`). NOT testable on testnet: the non-USD fiat PAYOUT (simulated, partner-pending → mainnet/external).
12. **Multi-chain (CCTP cross-chain receive)** — ⚠️ PART BUILD-GAP, not just untested: `api/webhooks/cctp/route.ts` verifies the inbound webhook but has **no `onVerified` handler** → a verified cross-chain deposit settles nothing; `/api/status` hardcodes CCTP "operational" (overclaim). BUILD: wire the CCTP/Circle/Gateway `onVerified` → settle-the-invoice effect + make `/api/status` probe real. THEN test cross-chain pay→settle (`pb-pay-edge.ts`) + duplicate-event idempotency. Until wired, cross-chain receive is NOT end-to-end functional — label honestly, don't claim verified.

## 🌐 OPS / EXTERNAL-LEFT (not in the code)

- **H1:** transfer all ~20 fund-holding contracts from the deployer EOA to a timelocked multisig (Safe) + accept Ownable2Step.
- **H2/secrets:** move operator key + service-role + HMAC + pgcrypto keys into KMS/HSM; wire the Circle DCW signer; run a `setOperator` rotation drill.
- **Monitoring/on-call:** confirm Sentry DSN in prod, PagerDuty + real on-call rotation; make `/api/status` probe Arc RPC + Circle for real.
- **DB durability/DR:** Supabase PITR + restore drill (F4: Redis loss + DB restore re-syncs via reconciler, no double-move); make the listener cursor durable in Postgres + alarm on loss.
- **RPC redundancy:** add a second Arc RPC / failover.
- **Prod env flips (config):** RESEND, VAPID, WEBHOOK_HMAC_SECRET, funded relayer wallet, reputation/counterparty addresses (deployed, unwired).
- **Runbooks (F3):** dispute resolve, stuck cashout, paused contract, operator-key leak, relayer gas refill.
- **SLOs/alerts**, durable rate limiter, **legal** (8 `/legal/*` pages real content; INR fiat needs money-transmitter licensing — mainnet-blocking), **DNS/TLS** certs + HSTS, **CI E2E** (no `playwright.config` + no e2e CI step today — green is a one-time manual artifact, not a gate).

## Critical path — ordered minimum to honestly say "everything works end-to-end"

1. **Custody + key safety first** (highest blast-radius): multisig owner + Ownable2Step (H1); operator key → KMS/HSM + on-chain velocity/co-sign guard (H2/A10).
2. **Close the redeploy drift:** re-run cashout 3-wallet drive + `pb-cashout` UI E2E against the live fee-bearing COP `0x347935…` with a non-zero fee, capture tx hashes.
3. **Fix the two silent-correctness bugs:** A4 (withhold the advertised 1% or drop the claim) + C1 (LP-claim RLS policy / daemon-route).
4. **Make the ledger trustworthy:** durable append-only audit log (I3) + disposition columns (A7) + a real reconciler self-heal proof (B1/B2).
5. **Enforce the AML/abuse perimeter:** server-side velocity/corridor caps (I2) + durable rate limiter over actions + `/pay` (C7/I4) + LP solvency gate (I1) + brand-logo SSRF guard (C8).
6. **Prove isolation + run the authored E2Es:** apply migrations 0034/0035/0036/0039 live, run pb-disputes/team/webhooks to green; add `TEST_VENDOR_B` cross-tenant + concurrent-claim race; one funded daemon dispute lifecycle.
7. **Wire conservation invariants + coverage into CI:** Echidna bodies + StdInvariant suites (A1/A2/A3) + a `playwright.config` + CI e2e job so green is repeatable.
8. **Stand up ops:** Sentry + PagerDuty on-call + Supabase PITR + DR drill + RPC failover + the five runbooks; flip prod env keys; verify legal + DNS/TLS.
9. **Only then, for MAINNET:** replace each honest `[SIMULATED]` leg that needs an external provider/license (fiat payout + proof verifier, screening, FX, agents custody, ERP).

---

## §20.1 — Build-left EXECUTION (2026-06-01)

Working the 🔨 build-left bucket. Each item below is marked DONE (code-completable
now, shipped + verified) or its precise blocker. Suite: 528 forge / 121 web / 65 daemon green.

### ✅ DONE — applied + committed this pass
- **C1 — LP-claim RLS** (`0043`, applied live): tightly-scoped UPDATE policy lets a
  staked LP claim a REQUESTED order (→ CLAIMED) for an LP profile they own. Live-mode
  LP claims no longer strand. Commit `056a44f`.
- **I3 — durable append-only audit log** (`0044`, applied live + code `3183d68`): a
  BEFORE UPDATE/DELETE/TRUNCATE trigger makes `audit_logs` immutable even to the
  service role; the admin UI now reads the durable table (ring is dev-only fallback).
- **A7 — terminal-money disposition** (`0045`, applied live): `released_to /
  amount_paid / fee_collected / refunded_to / disposition_tx` on `cashout_orders` +
  `agent_jobs`; `cashoutAdvancer` writes the release disposition from chain truth.
- **I2 — server-side daily cashout cap**: enforced in the live gate
  (`prepareCashoutRequestAction`) — reads `vendors.max_cashout_usdc_daily`
  (0/unset → $10k/day default), sums the last 24h, fails closed before any on-chain lock.

### ✅ DONE — second build-left pass (commits `5fa2bfb` / `25ed65a` / `bc50244`)
- **Contract invariants A1/A2** — live Foundry `StdInvariant` suites:
  `InvoiceConservation.t.sol` (I1) + `CashoutConservation.t.sol` (I2: conservation
  + no-double-release), each 256 runs × 128k calls, 0 reverts. Echidna header updated
  (all three invariants now have forge coverage; stubs stay fail-closed). **531 forge green.**
- **I4/C7 — durable rate limiter** — limiter is now Upstash-REST-backed (shared across
  edge nodes, fail-open) AND covers the public money pages `/pay`, `/i`, `/receipt` in
  addition to `/api/*`. The "unthrottled `/pay`" gap is closed.
- **A4 — invoice fee, resolved honestly** — NOT a testnet bug: `pricing.ts` already
  labels invoice fee `testnet: Free` / `standard: 1.0%` (mainnet-only), which MATCHES the
  code (0% on the default path on testnet). The real 1% withholding (inject a
  vendor/treasury split through create→buyer-EIP-712→settle) is genuine MAINNET work,
  needs the invoice E2E to verify → see Blocked/mainnet. **Fixed the actual live
  mismatch the cashout redeploy created**: `pricing.ts` said cashout was "Free
  (simulated)" on testnet but it now withholds 0.3% on-chain — corrected the comparison
  row + the mainnet-pricing FAQ.

### 🔨 REMAINING build-left — none code-completable for testnet
All clean, no-external-dependency build-left is now done (C1, I3, A7, I2, A1/A2, I4/C7,
A4-reconciliation). What remains is either mainnet-scoped or externally blocked (below).
The mainnet invoice-1% withholding (split injection) is the one feature a future
testnet→mainnet decision could pull forward, but it needs the runnable invoice E2E first.

### 🚫 BLOCKED build-left — cannot be completed in-repo (needs redeploy / economic design / external)
- **A10/H2 — operator-key blast-radius**: on-chain velocity / per-order co-sign guard =
  a CashoutOrderProcessor money-logic change (another redeploy) + a second signer
  (multisig/KMS = ops). Not a pure-code item.
- **I1 — LP-float solvency**: stake ≥ corridor-exposure predicate + LP-default make-whole
  path = contract change + economic/counterparty design (or an explicit PARTNER-PENDING gate).
- **External `[SIMULATED]` surfaces**: screening (Chainalysis/TRM/Sumsub), fiat payout +
  proof verifier (money-transmitter license), StableFX (Circle), ERP (6 OAuth apps),
  agents on-chain custody, card on-ramp, wallet passes — each needs a provider account /
  license before it can be built real. Deliberately flag-gated + labelled today.

---
---

# PART II — EXHAUSTIVE COVERAGE (the "miss nothing" layer)

> Part I (§0–§20.1) is the **flow + risk** plan: how a human walks the product and the
> money/security/ops categories a flow plan would pass while still broken. It is strong but
> (a) flow-organized, so individual pages are implicit, and (b) written before the
> 2026-06-02 build pass, so several honest-status labels and "fails today" notes are now
> stale. Part II makes coverage **literal and total**: every route, every API, every action,
> every worker, every contract, every device — each enumerated exactly once with an explicit
> desktop **and** mobile pass, for **both** primary user types (vendor & LP) plus buyer,
> admin, and agent-dev. Nothing here may be "covered by implication." A surface absent from
> these tables is a coverage bug in THIS document.
>
> **How Part II is used:** Part I tells you *how* to test (the act→audit visual loop §VISUAL,
> the multi-user matrix, the money/security gates). Part II tells you *what* must be tested so
> none of it is skipped. Run every row through the Part I **Universal verification rubric**
> (§"Universal verification rubric", 10 checks) and the **Per-screen visual checklist**
> (§VISUAL, layout/text/images/data/interaction/feedback/honesty/responsive). Every ☐ below is
> shorthand for "apply both rubrics, on this surface, at this viewport."

## II.0 — STATUS RECONCILIATION (read first — supersedes stale labels in Part I)

> Part I's feature-inventory honest-status cells and several "this test FAILS today" notes
> predate the 2026-06-02 build pass. Where Part I and this table disagree, **this table is
> current truth** — test for the expected outcome here, not the older label. Each item now has
> a repeatable on-chain proof in `apps/web/scripts/` (run from `apps/web/`).

| Part I ref | Old label / claim | **Now (2026-06-02)** | Proof / source | New expected outcome to test |
|---|---|---|---|---|
| **G5** LP prefs | "Coming soon (refuses)" | **LIVE** — `lp_preferences` table (migr 0048), vendor-scoped RLS | `app/lp/settings/{actions,page}.tsx` | Toggle notification + corridor → persists; reload shows saved state; **no "Coming soon" badge**. Mock/dev = best-effort no-op. |
| **F1** Retainer | "on-chain funding PARTNER-PENDING" | **PROVEN ON-CHAIN** on `RetainerStream` | `qa-retainer-stream-proof.mjs` ✅ | createStream escrows USDC; withdraw pays vested; cancel refunds unvested; `deposit==withdrawn+refund+claimable` holds. Vesting is real, not simulated. |
| **F2** FX | "StableFX PARTNER-PENDING / demo completed" | **REAL on-chain swap** USDC↔EURC | `qa-fx-swap-proof.mjs` ✅; `MockEURC 0xbe3EB8…6ACF3` | `registry.swap` 1 USDC→0.92 EURC; pulled from payer, paid from adapter liquidity, `SwapExecuted`. Daemon `stableFxAdapter` worker signs the real swap (was `[SIMULATED]` skip). |
| **E1** Agent escrow | "PARTNER-PENDING" | **PROVEN ON-CHAIN** on `AgentEscrow` | `qa-agent-escrow-proof.mjs` ✅ | register(operator EIP-712)→fund→start→deliver→complete; agent paid, 1% fee carved, escrow drained, job CLOSED. |
| **I3 / §20#12** CCTP | "build-gap: no onVerified, /api/status overclaims" | **Outbound PROVEN; integration built** | `qa-cctp-burn-proof.mjs` ✅; `apps/daemon/src/cctp.ts` | Arc `depositForBurn`→Circle Iris `complete` attestation. Inbound `receiveOnArc` code + unit tests done. `onVerified` now logs (`logInboundEvent`). **Inbound E2E still needs a source-chain burn — the one external-testnet dependency.** |
| **§10.2 / A5** Cashout fee | "fee never withheld; LP gets gross" | **WITHHELD ON-CHAIN** — COP redeployed `0x347935…E6bd` | `qa-cashout-fee-proof.mjs` ✅ | LP receives `amount − klaroFee`; fee → receiver; `CashoutFeeWithheld` event; escrow→0. Old fee-free COP `0x4047…226c` is DEAD — re-point any stale script. |
| **§12 / B1** Reconciler | "no standing DB↔chain reconciler exists" | **BUILT** — `reconciler.ts` worker (5-min cron) | `apps/daemon/src/workers/reconciler.ts` | A drift between DB status and on-chain `getOrder` is detected + alerted; still verify the self-heal + partial-failure robustness (TEST-LEFT §20 #10). |
| **§11 / A2** Invariants | "Echidna stubs revert; ZERO Foundry invariant suites" | **LIVE Foundry `StdInvariant`** | `test/invariant/{Cashout,Invoice}Conservation.t.sol`, `FeeSplitter` I3 | Conservation + no-double-release fuzz pass (256×128k, 0 reverts). Echidna stubs intentionally fail-closed. |
| **A7** Disposition | "terminal state doesn't encode who got paid" | **COLUMNS ADDED** (migr 0045) | `released_to/amount_paid/fee_collected/refunded_to/disposition_tx` | Each terminal money transition writes disposition from chain truth; DB row alone reconstructs the payee. |
| **C1** LP-claim RLS | "no UPDATE policy → claim strands" | **POLICY ADDED** (migr 0043) | `0043` | Staked LP claims REQUESTED→CLAIMED for an owned LP profile; cross-tenant LP write still denied. |
| **I2** Velocity cap | "zero cap enforcement on money path" | **DAILY CAP ENFORCED** | `prepareCashoutRequestAction` | Cashout over `vendors.max_cashout_usdc_daily` (default $10k) fails closed before lock. Per-corridor + new-account caps still BUILD-LEFT. |
| **I4/C7** Rate limit | "only `/api/*`; `/pay` unthrottled" | **DURABLE limiter** (Upstash) covers `/pay /i /receipt` + `/api` | `middleware.ts` | Burst the public money pages → throttled. Server-action throttle still verify. |

**Still genuinely open (do NOT mark green):** A10/H2 operator-key blast-radius (needs redeploy +
multisig/KMS), I1 LP-float solvency (contract + economic design), H1 multisig owner transfer,
external `[SIMULATED]` surfaces (screening, fiat payout, ERP, card on-ramp, wallet passes), and
**CCTP inbound-into-Arc E2E** (needs a source-chain burn). These remain NO-GO/PARTNER-PENDING per
Part I gates.

**Fresh inventory counts (verified against the tree 2026-06-02):** **89 UI pages · 26 API routes ·
24 server-action files · 17 daemon workers · 22 contracts (+ MockEURC).** (Part I's header said
85/30/22 — drift means new surfaces exist; they are all enumerated below so none is skipped.)

---

## II.A — COMPLETE ROUTE × VIEWPORT MATRIX (all 89 pages, desktop 🖥️ 1280×800 + mobile 📱 390×844)

> Every route in the app, grouped by persona/auth-state, each tested at BOTH viewports. "What
> must be right" is the page-specific bar **on top of** the universal rubric + visual checklist.
> Auth column: 🌐 public · 🔑 vendor · 💧 LP · 🛡️ admin/operator · 👤 buyer (no-auth money) · 🤖 agent-dev.
> Tick 🖥️ and 📱 only when the page passes the full visual checklist at that width.

### A1. Public · marketing / static / legal (🌐 logged-out must work; also re-check logged-in nav)
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/` | hero renders, mega-menu (Product/Resources) opens + routes, all CTAs land, testnet metrics show honest `live/simulated` source, no console error | ☐ | ☐ |
| `/pricing` | 3 tiers (Free / 1.0% / Custom), FAQ; **numbers match `pricing.ts` reality** (testnet Free vs mainnet 1%); cashout 0.3% row matches the now-live on-chain carve | ☐ | ☐ |
| `/product` | overview renders, links to all 5 subpages resolve | ☐ | ☐ |
| `/product/invoicing` | feature copy accurate, no dead CTA | ☐ | ☐ |
| `/product/cashout` | corridor/fee claims match reality (0.3% now real) | ☐ | ☐ |
| `/product/stablefx` | USDC↔EURC story; **honest that swap is now live-testnet via MockEURC**, USYC still pending | ☐ | ☐ |
| `/product/receipts` | on-chain receipt claim accurate | ☐ | ☐ |
| `/product/reputation` | reputation claim matches live-read/sim state | ☐ | ☐ |
| `/build` | developer landing renders | ☐ | ☐ |
| `/developers` | renders (or 301→/build) — confirm no 404 | ☐ | ☐ |
| `/docs` | docs index renders, internal links resolve | ☐ | ☐ |
| `/resources` | renders | ☐ | ☐ |
| `/resources/flows` | flow diagrams render, no broken images | ☐ | ☐ |
| `/company` | renders | ☐ | ☐ |
| `/company/contact` | submit contact form → honest confirmation; **message actually routes somewhere or says where**; spam/empty/oversized handled | ☐ | ☐ |
| `/fx` | FX quote UI; src/dst select; quote shows; honest `simulated`/`access-pending`/now-live label per pair | ☐ | ☐ |
| `/fx/[corridor]` | corridor detail (eurc, mxnb, …) renders, spread/route copy accurate | ☐ | ☐ |
| `/agents` | agent marketplace listing renders (empty + populated) | ☐ | ☐ |
| `/agents/[agentId]` | agent profile; pricing endpoint; honest if no real agents | ☐ | ☐ |
| `/brand-kit` | logo/color assets render + download | ☐ | ☐ |
| `/roadmap` | renders | ☐ | ☐ |
| `/help` | help index; search if any; links resolve | ☐ | ☐ |
| `/trust` | trust-center copy accurate to real controls | ☐ | ☐ |
| `/status` | **probes real CCTP/Gateway/RPC state, not hardcoded "operational"** (the overclaim fix); reflects honest CCTP status | ☐ | ☐ |
| `/x402-demo` | x402 negotiation demo; honest SIM unless `X402_ENABLED` | ☐ | ☐ |
| `/legal/terms` | real content (not lorem); renders | ☐ | ☐ |
| `/legal/privacy` | real content | ☐ | ☐ |
| `/legal/cookies` | real content | ☐ | ☐ |
| `/legal/dpa` | real content | ☐ | ☐ |
| `/legal/disclosures` | real content; INR money-transmitter disclosure honest | ☐ | ☐ |
| `/legal/subprocessors` | list matches actual subprocessors (Supabase/Circle/Resend/Sentry…) | ☐ | ☐ |
| `/legal/acceptable-use` | real content | ☐ | ☐ |
| `/offline` | PWA offline fallback renders when network down | ☐ | ☐ |
| `/account/privacy` | privacy-choices form → `deleteMyAccountAction` persists `deleted_at` + `aml_retention_until` (now+30d); honest countdown | ☐ | ☐ |

### A2. Auth & onboarding
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/signin` (magic-link) | enter email → email arrives → click → lands `/vendor`; session persists reload + new tab; expired/used link → honest error not crash | ☐ | ☐ |
| `/signin` (passkey) | WebAuthn register then assert on next visit; reject → recover; no identity leak | ☐ | ☐ |
| `/onboarding` | 4 steps (business→wallet→verification→first-invoice); each persists; refresh mid-flow resumes; completes → `vendors` row + wallet; wallet step honest if simulated | ☐ | ☐ |

### A3. Public payment surfaces (👤 buyer, no auth — money 💰🔗)
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/i/[id]` | opens for NON-vendor; vendor branding + amount + "Pay with USDC"; connect wallet → `acceptAndPay` → flips PAID; InvoicePaid→screening→settle pipeline; **wallet popup shows correct network+contract+amount**; insufficient-USDC / wrong-chain / rejected-sig / already-paid all honest | ☐ | ☐ |
| `/pay/[slug]` | reusable link pay; `getOrCreateInvoiceForLink` materializes + publishes; **per-(slug,wallet) dedup caps row/gas amplification**; same buyer edge cases | ☐ | ☐ |
| `/receipt/[hash]` | public receipt "Verified on Arc"; **`receipt_hash` == contract-derived hash**; renders for logged-out; bad hash → honest 404 | ☐ | ☐ |

### A4. Vendor (🔑 — the core product; logged-out → /signin, cross-tenant → 404)
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/vendor` | dashboard: balances, recent activity, empty state for new vendor, no N+1 lag | ☐ | ☐ |
| `/vendor/invoices` | list: empty→populated, filters, status badges, pagination at scale (1k rows) | ☐ | ☐ |
| `/vendor/invoices/new` | create (line items, customer, amount) → `invoices` row persists; bad/`Infinity`/`NaN` amount rejected; line-items sum == total; **orphan-free if line-item insert fails** | ☐ | ☐ |
| `/vendor/invoices/[id]` | detail: status timeline, copy hosted link, branding preview, PII handling, publish-on-chain CTA | ☐ | ☐ |
| `/vendor/invoices/[id]/screening` | screening surface — **SIMULATED → "manual review", never silent "passed"** | ☐ | ☐ |
| `/vendor/invoices/import` | bulk CSV import → rows created, bad rows reported honestly | ☐ | ☐ |
| `/vendor/invoices/recurring` | create schedule → persists; **honest whether it auto-fires**; verify daemon `lifecycleReminders` actually fires it | ☐ | ☐ |
| `/vendor/links` | list payment links; usage count; deactivate | ☐ | ☐ |
| `/vendor/links/new` | create reusable link → persists | ☐ | ☐ |
| `/vendor/links/[id]` | detail; deactivate; usage; copy URL | ☐ | ☐ |
| `/vendor/cashout` 💰🔗🏷️ | quote builder (amount+corridor), live quote refresh, fee/spread/rate shown; with wallet → `requestAndLock` → LOCKED (on-chain==DB); **without wallet → refused honestly, no fake success**; **daily cap enforced** (over `max_cashout_usdc_daily` fails closed); quote-expiry boundary clean | ☐ | ☐ |
| `/vendor/cashout/[id]` | 6-state timeline locked→claimed→proof→confirmed→released; **fiat leg labeled partner-pending even in live**; UTR "simulated reference" honest; disposition (released_to/amount_paid/fee_collected) shown post-release | ☐ | ☐ |
| `/vendor/retainer` 💰 | create stream (payer/amount/days) → **now REAL on-chain** (RetainerStream); withdraw vested, cancel refunds unvested; vesting counter accurate; **label no longer "no USDC locked"** | ☐ | ☐ |
| `/vendor/agents` 💰 | hire agent (select/amount/brief) → `agent_jobs` row; advance fund→start→deliver→accept; **on-chain AgentEscrow now real** (1% fee carve) | ☐ | ☐ |
| `/vendor/agents/[id]/jobs` | job history for an agent; each status+timestamp persists | ☐ | ☐ |
| `/vendor/delegations` | issue scoped session key → `session_keys` row; revoke → revoked_at; **"Circle ERC-6900 enforcement pending" label honest** | ☐ | ☐ |
| `/vendor/disputes` | list of vendor's cases | ☐ | ☐ |
| `/vendor/disputes/[caseId]` 💰 | open dispute, add evidence → EVIDENCE_SUBMITTED; **vendor can't self-decide (403 + RLS-denied direct)**; two-table write persists | ☐ | ☐ |
| `/vendor/bills` 💰🔗 | bills vendor owes; list/empty | ☐ | ☐ |
| `/vendor/bills/[id]` | pay-a-bill flow; auth + wallet checks; honest state | ☐ | ☐ |
| `/vendor/team` | invite (role) → row; change role; remove (soft); **owner self-row logic (not wrongly blocked)**; **cross-tenant role-escalation RLS-denied** | ☐ | ☐ |
| `/vendor/settings` | branding (name/color/logo) persists + shows on invoice/receipt; **logo URL must be https + SSRF-guarded (reject data:/internal/IMDS)** | ☐ | ☐ |
| `/vendor/integrations/webhooks` | create endpoint → **secret revealed ONCE + stored encrypted**; test-ping delivery; deactivate; **SSRF guard on endpoint URL** | ☐ | ☐ |
| `/vendor/integrations/erp` | ERP connect — honest planned/simulated label | ☐ | ☐ |
| `/vendor/exports` | export CSV/PDF → file downloads, content correct, RLS-scoped (only own data) | ☐ | ☐ |
| `/vendor/reputation` | renders real VendorReputation read (now written by daemon at settle/release) | ☐ | ☐ |
| `/vendor/trust-center` | honest about real vs preview controls | ☐ | ☐ |
| `/vendor/transit` | cross-chain transit dashboard — **honest "simulated · integration pending" badge** (CCTP code now exists but inbound E2E pending source burn); mock list clearly labeled | ☐ | ☐ |
| `/vendor/financing` | renders, honest preview vs real | ☐ | ☐ |

### A5. LP — liquidity provider (💧; logged-out → /signin, cross-LP → 404)
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/lp` | overview renders | ☐ | ☐ |
| `/lp/apply` | submit application (entity/country/wallet) → persists DOCS_UPLOADED; RLS: only this LP sees it | ☐ | ☐ |
| `/lp/docs` | submit KYB docs → UNDER_REVIEW | ☐ | ☐ |
| `/lp/dashboard` | real numbers (stake, claims, earnings); empty state | ☐ | ☐ |
| `/lp/queue` 💰 | claim a cashout (must be STAKED + payout wallet); **CAS race: two LPs can't both claim**; **live-mode claim works (0043 policy), cross-tenant denied** | ☐ | ☐ |
| `/lp/stake` 💰 | stake → STAKED + tier; below-min rejected; **"LPStaking partner-pending" honest**; tier from bigint not lossy display | ☐ | ☐ |
| `/lp/settings` | rotate payout wallet persists (same-wallet rejected); **notification + corridor toggles now PERSIST (lp_preferences) — no "Coming soon"** | ☐ | ☐ |
| `/lp/reputation` | renders real scores | ☐ | ☐ |
| `/lp/disputes` | LP-side dispute list | ☐ | ☐ |
| `/lp/disputes/[caseId]` 💰 | LP dispute view + evidence; LP can't self-decide | ☐ | ☐ |
| `/lp/disputes-explainer` | renders | ☐ | ☐ |
| `/lp/walkthrough` | onboarding walkthrough renders | ☐ | ☐ |

### A6. Admin / operator (🛡️; non-operator → forbidden, never leak surface)
| Route | What must be right | 🖥️ | 📱 |
|---|---|---|---|
| `/admin` | dashboard queues+KPIs; non-operator forbidden | ☐ | ☐ |
| `/admin/disputes` 💰 | decide (outcome+note) → **enqueues daemon `DisputeManager.decide`, NOT a fake DB flip**; request-evidence path | ☐ | ☐ |
| `/admin/manual-review` | screening review queue; approve/hold; honest sim | ☐ | ☐ |
| `/admin/risk-holds` | risk-hold queue; release/hold | ☐ | ☐ |
| `/admin/sanctions` | sanctions review; honest about list-refresh sim | ☐ | ☐ |
| `/admin/case-management` | case ops render + act | ☐ | ☐ |
| `/admin/limits` | protocol limits render; **note: display vs enforced — daily cap now enforced, corridor/new-acct still display** | ☐ | ☐ |
| `/admin/audit-log` | **reads durable `audit_logs` (not in-memory ring) after restart**; every operator action recorded; append-only | ☐ | ☐ |
| `/internal/kpi` | KPI aggregation renders from real `kpi_snapshots` (daemon cron); honest on any static reference rows | ☐ | ☐ |

> **Per-viewport gate:** a route is "done" only when BOTH 🖥️ and 📱 pass the full visual
> checklist. Log every defect with the route, viewport, screenshot, and the failing checklist item.

---

## II.B — COMPLETE API ENDPOINT MATRIX (all 26 routes)

> For EACH: happy path (correct auth/payload), **auth-negative** (no/forged key, wrong tenant),
> **payload-negative** (tampered amount/hash, oversized, malformed), **idempotency** (replay an
> `Idempotency-Key`; cross-tenant key isolation), and the **error class** (deferred → 503 not 500).

| Method · Route | Happy | Auth-neg | Payload/abuse-neg | Money? |
|---|---|---|---|---|
| `POST /api/v1/invoices` | create via API key → row | wrong/absent key → 401 | bad amount → 4xx not 500 | 💰 |
| `GET /api/v1/invoices/[id]` | read own | cross-tenant id → 404/forbid | — | |
| `POST /api/v1/cashouts` | create → quote-bound order | non-owner → denied | tampered quoteHash → rejected; over daily cap → refused | 💰 |
| `POST /api/v1/cashouts/quotes` | quote returns fee/spread + hash | unauth → 401 | quote-hash recompute matches; expiry honored | 💰 |
| `POST /api/v1/disputes` | open via API | non-party → denied | self-decide payload → rejected | 💰 |
| `POST /api/v1/fx/quotes` | quote returns rate+mode | unauth → 401 | **honest live/sim per pair**; precision (no float drift) | 🏷️ |
| `GET /api/v1/receipts/[hash]` | public verify; hash==chain | — | bad hash → 404 | 🔗 |
| `GET/POST /api/v1/webhooks` | register via live repo (not dead Map) | unauth → 401 | SSRF guard on URL; secret once | 🏷️ |
| `POST /api/v1/push/subscriptions` | store push sub (vendor_id,endpoint,p256dh,auth) | unauth → 401 | dup-endpoint upsert; prune 404/410 | |
| `POST /api/v1/webauthn/register/options` | challenge minted | — | bound to vendor | 🔒 |
| `POST /api/v1/webauthn/register/verify` | credential stored | — | replay/expiry rejected | 🔒 |
| `POST /api/v1/webauthn/assert/options` | challenge minted | — | — | 🔒 |
| `POST /api/v1/webauthn/assert/verify` | `{verified:true}` only | mismatch → 403 `credential_vendor_mismatch` | **no vendor_id/email/token in body**; stale counter → 401 | 🔒 |
| `POST /api/agents/[agentId]/call` | x402 402-negotiate → 200 on pay | — | **deferred → 503 not 500**; honest SIM unless enabled | 🏷️ |
| `POST /api/admin/pause` | operator pause/unpause signs on-chain | non-operator → forbidden | honest if it refuses on-chain | 💰 |
| `POST /api/auth/magic` | OTP issued, redirect allowlist-clamped | — | **off-allowlist redirect stripped**; rate-limited; uniform enum response | 🔒 |
| `GET /api/health` | real liveness | — | — | |
| `GET /api/status` | **probes real CCTP/Gateway/RPC** (no hardcode) | — | reflects honest CCTP build state | 🏷️ |
| `GET /api/openapi` | spec accurate to routes | — | — | |
| `GET /api/cron/lifecycle-reminders` | fires reminders | **timing-safe auth secret**; unauth → 401 | idempotent per window | |
| `POST /api/moonpay/buy` | sandbox widget params | unauth? | honest SIM unless `MOONPAY_*` | 🏷️ |
| `POST /api/webhooks/cctp` | verify sig → **`logInboundEvent` (onVerified now wired)** | bad sig → 401 (no oracle) | replay>300s → reject; dup-delivery → idempotent | 💰 |
| `POST /api/webhooks/circle` | verify → log inbound | bad sig → 401 | replay/dup rejected | 💰 |
| `POST /api/webhooks/gateway` | verify → log inbound | bad sig → 401 | replay/dup rejected | 💰 |
| `POST /api/webhooks/stripe` | verify → handle | bad sig → 401 | replay rejected | 💰 |
| `POST /api/webhooks/erp` | verify → handle | bad sig → 401 | SSRF-redirect → refused | |

---

## II.C — COMPLETE SERVER-ACTION MATRIX (all 24 action files)

> Server actions POST to the PAGE route, so the `/api/*` rate limiter does NOT see them (§16.1).
> For EACH action: success persists to the **live** source of truth; **direct invocation as the
> wrong tenant / unauth is refused server-side** (UI gating ≠ security); double-submit is
> idempotent; the honest-label is correct. Attack each by calling it directly, not just via the UI.

| Action file | Key actions | Must prove |
|---|---|---|
| `i/[id]/actions.ts` | acceptAndPay glue | buyer pays → PAID; no auth needed but payload bound to invoice | 
| `pay/[slug]/actions.ts` | getOrCreateInvoiceForLink | **unauth-callable** → (slug,wallet) dedup caps rows/gas; format-validate wallet |
| `vendor/agents/actions.ts` | hire/advance job, register agent | `agent_jobs` mirrors on-chain; cross-tenant job advance denied |
| `vendor/bills/[id]/actions.ts` | pay bill | wallet+auth checks; idempotent |
| `vendor/cashout/actions.ts` | prepare/request, quote-verify | quote-hash recompute; **daily cap fail-closed**; tampered amount rejected |
| `vendor/delegations/actions.ts` | issue/revoke session key | `session_keys` row; revoke drops from list |
| `vendor/disputes/actions.ts` | open/add-evidence | EVIDENCE_SUBMITTED; **no self-decide**; cross-tenant denied |
| `vendor/exports/actions.ts` | export CSV/PDF | RLS-scoped to own data only |
| `vendor/integrations/webhooks/actions.ts` | create/test/deactivate | secret once + encrypted; **`assertPublicHttpUrl` SSRF guard** |
| `vendor/invoices/new/actions.ts` | createInvoice | row persists; line-items sum==total; **orphan-free on partial fail** |
| `vendor/invoices/recurring/actions.ts` | create schedule | persists; honest auto-fire |
| `vendor/links/[id]/actions.ts` | deactivate/update link | persists; usage correct |
| `vendor/links/new/actions.ts` | create link | persists |
| `vendor/retainer/actions.ts` | create/withdraw/cancel stream | **now on-chain real**; vesting math; CAS on withdraw (no double) |
| `vendor/settings/actions.ts` | branding | persists; **logo URL needs `assertPublicHttpUrl` (currently `^https?` only — SSRF gap §16.6)** |
| `vendor/team/actions.ts` | invite/changeRole/remove | RLS WITH CHECK; **cross-tenant role-escalation denied** |
| `account/privacy/actions.ts` | deleteMyAccount | `deleted_at` + `aml_retention_until` persist |
| `admin/disputes/actions.ts` | requestEvidence/assignToReview/decide | operator-only; daemon-routed decide |
| `company/contact/actions.ts` | submit contact | routes somewhere honestly; spam-safe |
| `fx/actions.ts` | quote/settle | honest live/sim per pair; quote-owner check on settle |
| `lp/actions.ts` | apply/stake/rotate/claim | status transitions; CAS claim; cross-LP denied |
| `lp/disputes/actions.ts` | evidence | LP-side; no self-decide |
| `lp/settings/actions.ts` | toggleNotification/toggleCorridor/rotate | **now persist to lp_preferences (key validated)** |
| `onboarding/actions.ts` | step persistence + provision | resumes on refresh; provisions vendor+wallet |

---

## II.D — MOBILE & DEVICE PROTOCOL (both user types live on mobile)

> "Both users will have mobile" — vendors AND LPs operate from phones; buyers almost always open
> `/i/[id]` / `/pay/[slug]` from a mobile in-app browser (WhatsApp/email/Telegram). Mobile is a
> first-class pass, not an afterthought. Run the **entire** II.A matrix at mobile width, plus:

**Viewport / device matrix (run the money flows on each):**
- [ ] **390×844 iPhone (Safari)** — primary; passkey + WalletConnect quirks; PWA install + offline (`/offline`).
- [ ] **360×800 Android (Chrome)** — primary; injected-wallet (MetaMask mobile) deep-link.
- [ ] **375×667 small (iPhone SE)** — the cashout 6-state machine + invoice create must not clip.
- [ ] **768×1024 tablet** — layout doesn't strand in a broken mid-breakpoint.
- [ ] **In-app browsers** — WhatsApp / Gmail / Telegram webview opening `/i/[id]` + `/pay/[slug]`: wallet-connect handoff works or degrades honestly.

**Mobile-specific checklist — judge on every page + every money flow:**
- [ ] On-screen keyboard does NOT cover the active input or the submit button (cashout amount, invoice amount, dispute note, sign-in email).
- [ ] Tap targets ≥ 44px; no two interactive elements so close a thumb hits both.
- [ ] **No horizontal scroll** at any width; long USDC amounts + 0x addresses ellipsise, never overflow.
- [ ] Bottom-nav / hamburger reachable one-handed; mega-menu usable; sticky CTAs don't trap content.
- [ ] Wallet popup / passkey sheet returns to the right step (no lost state on app-switch).
- [ ] The cashout state machine renders each of its 6 states correctly on the smallest width.
- [ ] Tables (invoices, queue, audit-log) reflow to cards or scroll-contained — not a clipped grid.
- [ ] Modals/drawers are dismissible; focus returns; back-gesture doesn't break flow.
- [ ] Pull-to-refresh / scroll-restore mid-flow doesn't double-submit a money action.
- [ ] Image/QR/avatar load on slow 3G throttle; skeleton→content transition, no infinite shimmer.

**A11y (real users aren't all sighted/mouse):** keyboard-only through a full pay flow; screen-reader
labels on money buttons + amounts; visible focus; no focus trap in modals; contrast passes the
existing `axe-contrast-scan.mjs`.

**Locale:** ₹ vs $ formatting, timezone-correct timestamps, long-unicode names, RTL smoke.

---

## II.E — CROSS-FEATURE COMBINATION MATRIX (end-to-end means end-to-end)

> §8 has the 4 core money chains. "Every combination" means the **cross-feature** journeys where
> one feature's output feeds another, plus each flow crossed with each **adverse condition**. Run
> each as ONE continuous multi-context flow; verify every surface + the source of truth at each hop.

**E1. Feature-chaining journeys (output of one = input of next):**
- [ ] 💰🔗 Invoice → paid → **disputed** → operator decide → **RefundProtocol** returns USDC to buyer (not just settle).
- [ ] 💰🔗 Invoice paid → vendor **cashout** the proceeds → LP claim → proof → release (+ on-chain fee carve) → **reputation tick**.
- [ ] 💰🔗 Cashout → **dispute** opened → operator decide → `resolveDispute` slashes/refunds the CORRECT party → disposition row.
- [ ] 💰🔗 Agent job funded → **dispute** → resolveDispute pays agent or refunds principal (derived from on-chain outcome).
- [ ] 💰🔗 Retainer stream → **dispute** → resolve freezes vesting + refunds unvested to payer.
- [ ] 💰🔗 Vendor receives USDC → **FX swap** USDC→EURC (now real) → (future: **CCTP burn** EURC/USDC out to another chain).
- [ ] 💰🔗 **CCTP inbound** (buyer burns on Base/Eth Sepolia) → daemon `receiveOnArc` mints → settles an invoice (⚠️ needs source-chain burn — gated).
- [ ] 💰🔗 Payment **link** → buyer pays → invoice materializes → settle → **receipt** mints → verify hash.
- [ ] **Recurring** invoice schedule → daemon fires → buyer pays → settle (prove it actually auto-fires).
- [ ] **Bulk import** → publish each on-chain → pay a subset → reconcile.
- [ ] **LP full lifecycle**: apply → docs → operator approve → stake → claim → proof → release → reputation → settings/corridor toggle.
- [ ] **Team RBAC crossed with every vendor action**: an Admin-role teammate performs invoice/cashout/dispute; a Viewer-role is blocked on each.
- [ ] **Webhook** subscription → triggering event (invoice paid / cashout released) → signed delivery → retry on 5xx → DLQ on exhaustion → operator sees it.
- [ ] **Multi-currency cashout** across INR / BRL / MXN / PHP / EUR: per-currency rate+fee math, quote→lock→release; the non-USD fiat PAYOUT stays simulated/partner-pending (honest).

**E2. Each core flow × each adverse condition (the combinatorial grid — run the cell, not just the row):**

| Flow ↓ \ Condition → | Quote expiry at boundary | Daemon/Redis down mid-flow | Wrong wallet / wrong chain | Rejected signature | Double-submit | Contract paused | Cross-tenant attempt | Back/refresh mid-flow |
|---|---|---|---|---|---|---|---|---|
| Invoice pay | n/a | honest "processing", completes on recover | popup blocks, honest | clean recover | idempotent | settle blocked honestly | B can't pay A's as A | no double-pay |
| Cashout | expired → refresh, no stale exec | order stuck→reconciler/honest | refused | clean | one row | requestAndLock reverts honestly | B can't advance A's | no double-lock |
| Dispute | n/a | decide queues, honest | n/a | n/a | one case | resolve blocked honestly | non-party denied | no dup evidence |
| Agent job | n/a | advance queues | refused | clean | one job | transitions blocked | non-principal denied | no double-fund |
| Retainer | n/a | n/a (on-chain direct) | refused | clean | **CAS: no double-withdraw** | cancel/withdraw paused | non-payer/-recipient denied | no double-withdraw |
| FX swap | quote stale → re-quote | worker queues | refused | clean | idempotent (quoteId) | swap paused honestly | operator-gated | no double-swap |
| LP claim | n/a | n/a | refused | clean | **exactly one winner** | n/a | cross-LP denied | clean |

> Fill EVERY cell. A blank cell is an untested combination. The grid is the literal meaning of
> "every single combination."

---

## II.F — DAEMON WORKER × TRIGGER × OUTCOME MATRIX (17 workers — the back-of-house UI testing misses)

> The UI shows intent; the daemon moves money. Each worker: what triggers it, the happy outcome,
> idempotency under BullMQ retry, and the honest behavior when it can't run.

| Worker | Trigger | Happy outcome | Retry idempotency | If it can't run |
|---|---|---|---|---|
| `cashoutAdvancer` | OrderClaimed/Proof events + cron | claim→proof→release legs signed; disposition written | chain-first status guard; no double-release | order honest "processing", reconciler heals |
| `screenAndSettle` | InvoicePaid | screen → settle (only after pass) | never re-settles | never auto-settles while simulated |
| `proofVerifier` | proof submitted | anchors verified proof | idempotent | manual-review queue |
| `disputeDecide` | admin decide | DisputeManager.decide signed | once | not faked |
| `disputeResolver` | Decided event | resolveDispute on right escrow | once; deterministic outcomes only | slash/penalize → admin |
| `disputeRouting` | dispute opened | routes to correct escrow context | — | — |
| `receiptGenerate` | settle | AuditReceipt mint; hash==chain | no dup receipt | — |
| `reconciler` (B1) | 5-min cron | DB↔chain drift detected + alerted | — | **the safety net** |
| `notifications` | lifecycle | email (Resend) + **web-push fan-out** | dedup jobId | console/no-op honest |
| `webhookDelivery` | outbound event | signed delivery + retry→DLQ | dedup | DLQ + alert |
| `erpSync` | ERP event | sync push | — | honest planned/sim |
| `sanctionsRefresh` | daily cron | list refresh | — | honest sim |
| `kpiAggregator` | hourly+daily cron | real `kpi_snapshots` rollup (soft-delete-filtered) | bucketed upsert (no dup) | — |
| `lifecycleReminders` | hourly cron | recurring-invoice + reminder fires | — | — |
| `adminRisk` | 15-min cron | risk escalation | — | — |
| `stableFxAdapter` | fx-execute | **real `registry.swap` USDC→EURC** | DB-backed (status+tx_hash) | requireArcWalletInProd fail-loud |
| `_dlq` | failed jobs | dead-letter capture + watch | — | operator visibility |

---

## II.G — CONTRACT × UI-TOUCHPOINT MATRIX (22 + MockEURC — every contract maps to a test)

> Foundry covers each in isolation (531 green). Here: the live UI/daemon touchpoint to spot-check
> against the deployed address, so "tested in isolation" becomes "driven end-to-end."

| Contract | Live touchpoint | Spot-check |
|---|---|---|
| `InvoiceEscrow` | invoice pay/settle | escrow holds then releases; receipt hash |
| `CashoutOrderProcessor` (`0x347935…`) | cashout flow | lock→release; **fee carve** (`qa-cashout-fee-proof`) |
| `DisputeManager` | disputes | decide→outcome drives escrow |
| `AgentEscrow` (`0xedCd31…`) | `/vendor/agents` | `qa-agent-escrow-proof` lifecycle + fee |
| `AgentRegistry` (`0x3cb3b0…`) | agent register | operator EIP-712 co-sign |
| `AgentBudgetWallet` | agent spend caps | testnet |
| `RetainerStream` (`0xd6891f…`) | `/vendor/retainer` | `qa-retainer-stream-proof` conservation |
| `StableFXAdapterRegistry` (`0x9B8336…`) | `/fx` + daemon | `qa-fx-swap-proof` swap |
| `MockStableFXAdapter` (`0xba4714…`) | FX liquidity | rate 0.92 + EURC pool seeded |
| `MockEURC` (`0xbe3EB8…`) | FX dst token | balances/transfers; 6-dp |
| `LPStaking` / `LPRegistry` | `/lp/stake`, `/lp/queue` | stake/tier; claim CAS |
| `FeeSplitter` (`0x3b2e07…`) | fee display vs split | I3 invariant; dust direction |
| `AuditReceipt` (`0x19d44E…`) | `/receipt/[hash]` | mint + verify hash |
| `ProofRegistry` (`0xb0a2c7…`) | cashout proof | anchor behind C4 |
| `VendorReputation` (`0xb44CE8…`) | `/vendor/reputation` | daemon writes at settle/release |
| `ReputationManager` (`0xe9272c…`) | reputation read | renders score |
| `RefundProtocol` (`0x3467b6…`) | invoice/dispute refund | returns USDC |
| `RoutePolicyEngine` (`0xb33f84…`) | corridor routing | policy gate |
| `MultiChainRouter` (`0xaf636e…`) | transit/CCTP | route selection |
| `CounterpartyRegistry` (`0x59cec2…`) | denylist | blocks denied counterparty |
| `PrivacyVeil` (`0x73660e…`) | masked amounts | never plaintext leak |
| `KlaroConfig` / `ReasonCodes` | internal | Foundry-only; reason hashes |
| **CCTP** TokenMessengerV2 `0x8FE6B9…` / MessageTransmitterV2 `0xE737e5…` | transit + daemon `cctp.ts` | `qa-cctp-burn-proof` outbound; inbound code |

---

## II.H — LIVE PROOF-SCRIPT REGRESSION (run before any release; tx hashes in output)

> The five committed proof scripts ARE the repeatable on-chain regression for the money-movers
> proven this pass. Run each from `apps/web/` against Arc testnet; each prints `*_OK=true` + tx
> hashes. A red run = a money regression = NO-GO. Fold into CI once a `playwright.config` + e2e
> job exist (Gate F5).

- [ ] `node scripts/qa-cashout-fee-proof.mjs` → `FEE_PROOF_OK=true` (LP gets amount−fee, fee→receiver, escrow→0)
- [ ] `node scripts/qa-agent-escrow-proof.mjs` → `AGENT_ESCROW_PROOF_OK=true` (paid + 1% fee + CLOSED)
- [ ] `node scripts/qa-retainer-stream-proof.mjs` → `RETAINER_STREAM_PROOF_OK=true` (withdraw+refund+conservation)
- [ ] `node scripts/qa-fx-swap-proof.mjs` → `FX_SWAP_PROOF_OK=true` (1 USDC→0.92 EURC)
- [ ] `node scripts/qa-cctp-burn-proof.mjs` → `CCTP_BURN_PROOF_OK=true` (burn + Circle attestation)
- [ ] `node scripts/qa-link-onchain.mjs` → `LINK_E2E_OK=true` (vendor delta == amount)

> **Every proof asserts on gas-independent quantities** (contract balances + event amounts), never a
> signer's wallet delta — because Arc pays gas in native USDC and would confound it. Preserve that
> property in any new proof.

---

## II.Z — 100% COVERAGE SIGN-OFF (the meta-gate: prove nothing was skipped)

> The plan is "100%" only when this closes with zero blanks. This is the audit that the rest of the
> plan was actually executed — the guard against a green-looking but partial pass.

- [ ] **Route ledger:** all 89 routes in II.A ticked at BOTH 🖥️ and 📱, OR explicitly marked N/A with a reason.
- [ ] **API ledger:** all 26 endpoints in II.B have happy + auth-neg + payload-neg + idempotency proof.
- [ ] **Action ledger:** all 24 action files in II.C proven to persist + refuse-cross-tenant on direct call.
- [ ] **Worker ledger:** all 17 workers in II.F proven for happy + retry-idempotency + can't-run-honesty.
- [ ] **Contract ledger:** all 22+CCTP+MockEURC in II.G have a driven touchpoint (not just a unit test).
- [ ] **Combination grid:** every cell of II.E2 filled; every II.E1 chain run end-to-end.
- [ ] **Device grid:** II.D viewport matrix run for the money flows; mobile checklist clean per page.
- [ ] **Status reconciliation:** II.0 verified — no test chased an already-fixed bug; new live labels confirmed.
- [ ] **Part I gates:** the 54-check launch gate (Gates A–I) re-evaluated against current state; each P0 red is a NO-GO.
- [ ] **Living regression:** the route/API/action/worker ledgers are wired into a CI coverage audit that FAILS on any new untested surface (Gate F5) — a one-time 100% rots without it.
- [ ] **Human verdict:** beyond pass/fail, the friction/trust read recorded per major flow (§VISUAL "human verdict").

> **Definition of 100%:** not "every test passed" — it is *"every surface in this codebase has a
> named, executed check, at both viewports, for every user who touches it, including the adverse
> and cross-tenant paths, with the result verified against the source of truth (DB/on-chain), and a
> CI gate that fails the moment a new surface appears untested."* Anything less is a sample, not a
> cover.

---
---

# PART II★ — ADVERSARIAL-AUDIT GAP CLOSURE (the Rabby-user UI / nav / wallet layer)

> A 6-dimension adversarial audit (13 agents, against the real codebase, 2026-06-03) scored the
> plan at **82%** and found **39 verified gaps** — every one grounded in a named source file —
> precisely where a hands-on **Rabby-wallet user lives**: the wallet front-door and the navigation
> chrome, NOT the protocol/outcome layer (which is strong). The audit's value: a route×contract
> matrix can be "complete" while the everyday human journey — pressing ⌘K, the first-time
> "Add Arc network to Rabby" popup, the wrong-wallet banner *before* any popup, reading whether a
> mobile quote card is a live number or a designer placeholder — is untested. This section closes
> all 39. Each is a REQUIRED check with its source-file anchor so a tester can find the exact
> element. Run every box through the Part I rubrics (universal + per-screen visual) at BOTH
> viewports. **The plan does not get to claim 100% until II★.1–II★.6 are green.**

## II★.1 — NAVIGATION CHROME & GLOBAL UI ELEMENTS (every clickable nav surface a route-matrix misses)

### ⌘K command palette — the most powerful vendor nav surface [P0]
- [ ] `CommandPalette.tsx` (mounted in `AppShell.tsx`): open via **⌘K / Ctrl+K** AND the desktop "Search… ⌘K" pill AND the mobile magnifier; typing filters (e.g. "cash"→Cashout); **ArrowUp/Down + Enter** navigates; verify all 10 commands resolve to live routes (no dead link); **"New cashout" actually opens `/vendor/cashout?new=1`** (the new-cashout state, not bare `/vendor/cashout`); **ESC and backdrop-click** both close and restore focus. (🖥️ + 📱)

### AppShell navigation chrome — sidebar / tabs / More-sheet / FAB / bell / sign-out [P0]
- [ ] **Desktop:** click all **8 sidebar items**; the active one highlights (`aria-current`).
- [ ] **Mobile:** tap all **5 bottom-tabs** (active state + the unread badge dot **only when `notifCount>0`**); tap the **+ FAB → `/vendor/invoices/new`**; open the **"More" bottom-sheet** (body-scroll locked) — **Links / Disputes / Team / Settings are reachable on mobile ONLY through this sheet** — tap each, then **X and backdrop both close it + restore focus**.
- [ ] Tap the **notification bell** (desktop + mobile) → `/vendor/disputes`.
- [ ] Tap **"Sign out"** → `POST /api/auth/signout` ends the session → `/signin`. *(src: `AppShell.tsx` sideItems/tabItems/moreItems/bell/FAB/sheet/sign-out form)*

### Navigation reachability / orphan audit [P1]
- [ ] For **every shipped `/vendor` route**, name the nav element OR in-page CTA that reaches it. **Flag every route reachable only by typed URL** — today: `bills, exports, transit, financing, retainer, delegations, agents, integrations/{erp,webhooks}, invoices/{import,recurring}` (none appear in AppShell or the ⌘K palette). For each, add a per-route note that it has **no nav entry point**, so QA never assumes the sidebar covers it.

### Global footer — 18 internal links + 3 mailto + logo [P1]
- [ ] `Footer.tsx` (every public page): all **18 links resolve** (no 404); the **3 `mailto:`** targets are exactly `hi@ / sales@ / security@klaro.so`; the **"klaro.so" wordmark + footer logo both → `/`**.

### Mega-menu + mobile hamburger interaction details [P2]
- [ ] `MegaMenu.tsx` / `Nav.tsx`: desktop hover opens the panel; a quick cursor cross-gap **keeps it open (140ms delay-out)**; moving away auto-closes; **ESC + outside-click** close; each menuitem routes; flat items **Pricing/Build/Company** + both header CTAs **"Sign in" + "Open klaro →" (both → `/signin`)**. Mobile hamburger: opens the sheet with **background scroll locked**; ESC, a link tap, and X each close it + restore scroll.

### Cookie-consent banner — blocks the first interaction for every new visitor [P2]
- [ ] `CookieConsent.tsx`: fresh profile/incognito → bottom-pinned bar on first load; **both "Essential only" and "Accept all" dismiss it**; choice persists in `localStorage('klaro.cookie.consent.v1')` so it stays gone on reload; on mobile it **docks below content without covering the primary CTA** (the QA-057 regression).

### Exports page elements — date pickers + two distinct downloads [P2]
- [ ] `ExportsClient.tsx`: set **From/To** → the row-set + the post-download summary line (count/total/uniqueCustomers) reflect the window; **"Download CSV"** → `klaro-tax-pack-<from>_<to>.csv`; **"Download JSON"** is a distinct second control → `klaro-audit-pack-*.json` (**valid JSON, not PDF** — correct any "PDF" wording); both **RLS-scoped to own data**.

### Footer LocaleSwitcher [P3]
- [ ] `LocaleSwitcher.tsx`: pick another locale → `klaro_locale` cookie written, page reloads, copy switches, selection persists next visit. **Caveat:** the full reload drops scroll/form state — flag if switched mid-flow.

### `/account/privacy` legacy VendorNav inconsistency [P3]
- [ ] `/account/privacy` renders the **legacy `VendorNav`** (Home/Invoices/Cashout/Reputation/Settings — different chrome than every other signed-in page's AppShell). Confirm its links all resolve and the user can return to the main vendor app, **or flag the nav inconsistency** for migration onto AppShell.

## II★.2 — WALLET / RABBY INTERACTION LAYER (every popup, every reject, every edge a real signer hits)

### First-time "Add Arc Testnet to Rabby" (`wallet_addEthereumChain`) [P0]
- [ ] On `/i/[id]` (buyer) or `/vendor/cashout` (vendor), tap **"Switch to Arc Testnet"**:
  - (a) **Arc NOT yet added** → Rabby shows the **Add-Network sheet** (name=Arc, RPC=`https://rpc.testnet.arc.network`, **chainId=5042002**, native symbol=USDC, ArcScan explorer) → approve → a **SECOND switch popup** → both approved → panel advances.
  - (b) **Arc already added** → a single switch popup.
  - (c) **switch REJECT** → "Switch failed: …" renders, no signing.
  - (d) **wallet rejects the ADD** → since the app has **no `addEthereumChain` helper** (`ConnectWalletButton.tsx:46` only `switchChain`), assert the copy gives the user the RPC URL + chainId to paste manually — **flag if it only says "change it and reload."** *(src: PublishInvoiceOnChain / RequestCashoutOnChain / PayWithUSDC switch blocks; double-popup handled in `e2e/pb-publish.ts`)*

### In-app wrong-wallet HARD-BLOCK banner (connected ≠ payout wallet), incl. `/vendor/links/new` [P1]
- [ ] Connect **Rabby account #2 (NOT the payout wallet)** on publish / cashout / **link-create** → the amber/rose **"isn't this account's payout wallet" banner** renders showing **both** short-addresses, the action button is **DISABLED**, and clicking opens **NO wallet popup at all**; then **switch to the correct account in Rabby (no reload)** → banner clears + button re-enables (live account-switch recovery). *(`/vendor/links/new` mismatch banner in `LinkForm.tsx` is wholly uncovered today.)*

### User-side insufficient GAS — the signer's own 18-dec native token [P1]
- [ ] Connect a Rabby wallet funded with **exactly the amount** (zero gas headroom) → tap pay/lock → Rabby's popup shows the **18-dec NATIVE gas estimate** and the tx cannot-sign / fails honestly. The app's only guard is `balance(6-dec USDC) < amount` (`PayWithUSDC.tsx:92`) which **reserves nothing for gas** — assert the failure is an honest pre-warning, **not a raw Rabby gas-revert**. Reconcile the doc's "gas-in-USDC" wording (config line, I1/I7) with the **18-dec native** `arcTestnet` chain. *(All existing gas coverage — §16.2/§19.5/I4 — is the OPERATOR relayer wallet, never the end-user signer.)*

### Allowance one-vs-two-popup (cashout) + buyer three-popup sequencing [P2]
- [ ] **Cashout `RequestCashoutOnChain`:** (a) fresh wallet (zero allowance) → **TWO popups in order (approve → await receipt → lock)**, each label correct; (b) reject the **first (approve)** → "You cancelled the signature", no lock; (c) reject the **second (lock)** after approving → honest recover, and a **retry does NOT re-prompt approve** (allowance now sufficient → single popup) — proves the one-popup branch.
- [ ] **Buyer `PayWithUSDC`:** enumerate the **three** popups as ordered steps — (1) **EIP-712 sign** (off-chain, no gas), (2) **approve USDC** (correct spender+amount), (3) **acceptAndPay** (correct contract+args); test **REJECT and STALL at EACH independently** with the specific recovery copy.

### Connector selection / disconnect / reconnect lifecycle [P2]
- [ ] `ConnectWalletButton.tsx` always uses `connectors[0]=injected`: (a) **desktop with no injected extension** → click "Connect wallet" → document what happens (likely nothing) and decide if the **WalletConnect QR** connector (registered in `Web3Provider` but unreachable from the UI) should be offered; (b) make the iOS WalletConnect rows actually **drive** the QR/deep-link; (c) connect → address pill + green dot → **disconnect** → button returns to "Connect wallet", any open pay panel falls back to the connect CTA (no stale signed state) → **reconnect** succeeds; assert the **"Opening wallet…"** pending state renders.

### Account-switch MID-panel (Rabby switcher while a signing panel is open) [P2]
- [ ] Connect account A on `/i/[id]` (or publish/cashout) with sufficient USDC, then **switch to account B (insufficient) via Rabby's switcher WITHOUT reload** → the panel **live-updates** to "Insufficient USDC" (disabled) and back when switching to A; on publish/cashout the **mismatch banner appears/clears live** and no stale address is used for the next signature. *(All four signing components read live `useAccount()`.)*

### Vendor EIP-712 `LinkInvoiceAuthorization` sign — the only vendor-side typed-data sign [P2]
- [ ] `/vendor/links/new` live mode (`LinkForm.tsx`): click **"Sign & create link →"** → Rabby shows the **typed-data sheet** (domain "Klaro Invoice" v1, verifyingContract=InvoiceEscrow, message=vendor/token/amount/linkId/authDeadline) → verify domain + amount + `authDeadline` match the form → approve → link persists **with the auth**; **reject** → "You cancelled the signature", no row; **wrong-account** → `walletMatches` banner blocks signing entirely. *(Plan previously treated link creation as a pure DB write.)*

### Funding journey — "I have 0 USDC": faucet / MoonPay Card→USDC out-and-back [P2]
- [ ] In the **insufficient-USDC** state: **"Get testnet USDC →"** opens the Circle faucet in a new tab (`target=_blank rel=noreferrer`); **"Card → USDC"** opens `/api/moonpay/buy` with the correct amount + redirect (both hrefs resolve). Journey: **connect with 0 USDC → fund externally → return → the balance re-fetches and Pay/Lock enables WITHOUT a hard reload**; test faucet rate-limit + wrong-network-funded recovery. *(No funding path exists on `/vendor/cashout` for the vendor's own wallet — flag it.)*

### Exact reject / wrong-wallet / "simulated on testnet" copy in the live cashout component [P2]
- [ ] `RequestCashoutOnChain.tsx`: Rabby-reject → **"You cancelled the signature. Try again when ready."**; the wrong-wallet banner correctly states the lock escrows from the **signing** wallet; wrong-chain → **"Switch to Arc Testnet"**; and the **"simulated on testnet — no real LP or fiat moves"** hint renders on the live lock screen with that exact wording.

## II★.3 — READABLE-CONTENT HONESTY READS (read every single thing — and judge it)

### Mobile cashout quote card — live-derived, NOT designer placeholders [P1]
- [ ] `/vendor/cashout` mobile `MobileCashoutQuote`: You-give / You-receive / rate / fee / expiry must be **derived from the live `quoteCashout()`**, not the placeholders **2,400 / ₹2,01,360 / fee 0.4% / 83.90 / expires 4:48**; assert the displayed **fee % == (corridor.klaroFee + lpSpread)×100 from `corridors.ts` (≈0.7%, NOT 0.4%)** and payout == `formatPayout(quote)` for the entered amount.

### `/status` "Illustrative" disclaimer prose [P1]
- [ ] Read `/status` as a human: while every service row says "operational", the **"Illustrative — not yet live-monitored / targets, not real-time probes"** disclaimer must be present + prominent, and the **CCTP V2 row must not read as operational without the honest "inbound integration pending" caveat** (II.0). *(Plan's F2/II.B target only the probe wiring, never the visible paragraph.)*

### Resolved-cashout badge semantics — who got paid [P2]
- [ ] `/vendor/cashout` `STATUS_LABEL`: **`RESOLVED_LP_PAYS` reads as the vendor LOSING** ("Resolved · LP retained funds"); **`RESOLVED_VENDOR_PAYS` reads as refunded** ("Resolved · refunded to you"); the label must not be misreadable as the opposite outcome.

### Corridor-status WORDING sweep across 3 surfaces [P2]
- [ ] For each `CorridorStatus`, read the badge on `/product/cashout`, the `/vendor/cashout` list, AND the quote panel; the words must **agree per status**, and a USDC-native/live corridor must **never render as a bare "Live" chip** that reads as a completed fiat payout (QA-075). Map each rendered string back to `corridors.ts`.

### Validation-error copy + unformatted $1B cap [P2]
- [ ] Submit **0 / negative / NaN / Infinity / >$1B / "12.3.4"** (UI + API) and **read the returned message**: human-honest + actionable (no raw exception leak), and the cap renders **formatted ($1,000,000,000, not raw `1000000000`** that `money.ts` ships).

### Mobile cashout confirm/complete/dispute prose [P2]
- [ ] In each mobile cashout state read every line for honesty: SLA **"< 24h · usually 2h"** must not over-promise on testnet; **"Partner-submitted screenshot (tap to expand)"** placeholder must read as a demo, not a real artifact; the fallback **Demo-ref/UTR** must read as a **simulated** reference, never a real bank reference.

### Legal-page testnet-honesty CLAIMS — accuracy, not just non-lorem [P2]
- [ ] Read `/legal/terms` + `/legal/acceptable-use` + `/legal/disclosures`: the factual claims — **"unaudited at testnet", "not a bank / broker-dealer / money services business", "KYB mainnet-only / testnet permissionless"** — must be **accurate + mutually consistent** with the no-fiat-custody / simulated-INR posture named in pricing/trust (not merely non-lorem).

### Pricing FAQ prose + compare-grid + disclaimer [P3]
- [ ] Expand each of the **6 `/pricing` FAQ** answers + read the **"Klaro is not a bank…"** disclaimer + every compare-table cell; verify against code: **0.3% on-chain withholding** (corridors.ts + the live COP carve), settled-volume **excludes refunded/disputed/held**, "no hidden FX markup", and that **ERP "Tally/Xero read-only beta", retention 90d/2y/7y, SOC-2, 24×7 on-call** match the actual feature state — not aspirational prose.

## II★.4 — AUTH FRONT-DOOR (match the LIVE UI, not the assumed one)

### Google OAuth primary + passkey honestly-disabled [P1]
- [ ] `/signin`: the **first, primary, full-width CTA is "Continue with Google"** → `/auth/callback?next=/vendor` → `/vendor`; session persists reload + new tab. **Magic-link is secondary.** The **passkey button is hard-OFF** — assert it is honestly disabled ("Passkey sign-in isn't available yet — use Google or magic link"), NOT a working register→assert login. *(Plan previously tested a passkey login that is intentionally off and skipped the actual primary CTA.)*

### Onboarding 3 wallet branches + broken `/vendor?welcome=1` prefill [P1]
- [ ] Onboarding step 2 — walk all three radios: (a) **Circle MPC** → Simulated label, no wallet recorded, later cashout blocks honestly; (b) **external paste** → the pasted address **MUST equal** the later-connected Rabby address or the cashout mismatch guard (`RequestCashoutOnChain.tsx:97`) fires; (c) **decide-later** → can still create/publish but is steered to Settings→Wallet before cashout.
- [ ] Complete onboarding → land on **`/vendor?welcome=1`** → assert a welcome/first-invoice CTA renders **AND `/vendor/invoices/new` is pre-filled** with the step-4 email/amount/description; **if unimplemented, FLAG the broken promise** (step-4 copy claims a prefill that doesn't happen).

## II★.5 — LP PATH RECONCILIATION (persona vs the real build)

### `/lp/stake` is a NO-WALLET server-action form [P1]
- [ ] **Tester note:** `/lp/stake` is a plain server-action form (LPStaking.register custody partner-pending) — **do NOT hunt for a Rabby connect/sign**; the persona step "connect Rabby to stake" is not implemented. Assert the honest partner-pending label renders **exactly at the Confirm-stake click** where a user expects a signature. The amount control is a **number input** (min 50, step 10), **disabled until APPROVED/STAKED**; the submit label is **"Confirm stake →"** when unstaked vs **"Update stake"** when STAKED; the 5 tier cards are presentational.

### LP proof is daemon-advanced — no LP submit button [P3]
- [ ] Clarify on `/lp/queue` + `/lp/walkthrough`: proof is **daemon/operator-advanced** on testnet (no LP proof-submit surface). Assert the pages are honest about this, then verify the **LP SEES the order flip to RELEASED** in their view once the daemon advances it.

## II★.6 — COMBINATION-GRID EXPANSIONS (add these to §II.E — every blank is an untested combo)

### Two live tabs, same record + same actor [P1]
- [ ] Open the same invoice/cashout in **two tabs**, act in tab A (publish / confirm-receipt / pay), then submit the **stale tab B** without refreshing → the second action is a **clean idempotent no-op or honest "already done / state changed — refresh"**, never a double-execute or a 500. *(The §II.E2 "Back/refresh" column is single-tab; the multi-context table is multi-PARTY, not two tabs of one actor.)*

### RBAC role-CHANGE mid-session re-gating [P1]
- [ ] Owner demotes an **Admin → ReadOnly mid-session** → the demoted member's **next** createInvoice/cashout/dispute is refused (the gate re-reads the **live** role, not a stale session); inverse: a ReadOnly **promoted to Admin** can act without re-login.

### Cashout confirm-vs-dispute FORK [P2]
- [ ] At cashout **PROOF_SUBMITTED** the **vendor clicks Dispute (not Confirm)** → order **FREEZES** (no RELEASE; copy warns disputing freezes the order) → admin decide → resolveDispute pays the correct party. **Assert the LP is NOT paid while DISPUTED.**

### Corridor switched after quote (stale quoteHash) [P2]
- [ ] Cashout: pick **INR → quote → switch corridor (BRL/MXN/PHP/EUR) → lock** → the **stale quoteHash is rejected** (`quote_hash_mismatch`) and the new corridor forces a fresh quote with the correct per-currency klaroFee/lpSpread — never silently locking the new currency against the old INR fee.

### Wallet rotation BETWEEN lock and release [P2]
- [ ] Vendor locks a cashout (binds vendorWallet) → **rotates payout wallet in settings** → release fires → assert release pays the **wallet bound AT LOCK**, never the new wallet silently. Same for an **LP rotating payout wallet between claim and release**.

### Invoice edit / cancel / void — probe + flag if absent [P2]
- [ ] Probe explicitly for an invoice **edit/cancel/void** affordance: `invoices/new/actions.ts` exports only create + record-published; CANCELLED/REFUNDED labels render but REFUNDED is reachable **only via dispute→RefundProtocol**. **If no UI affordance ships, record it as a deliberate product gap** so coverage isn't silently assuming a control that doesn't exist; test whether an unpublished CREATED invoice can (or honestly cannot) be amended before publish.

### Recurring fires while a prior instance is disputed [P2]
- [ ] Create a recurring schedule → first instance disputed/churned → confirm the **next cron fire still mints (or is suppressed)** → attempt to **pause/cancel** the schedule and verify whether any such control exists; if no pause/cancel ships, **flag the missing control** rather than leaving the state untested.

### Session-key REVOKE mid-agent-job [P3]
- [ ] Issue a scoped session key → start an agent job the delegate advances → **revoke the key mid-flight** → confirm the delegate can no longer advance (or that the action is server-side gated regardless, with the honest "Circle enforcement pending" label acknowledged).

### Webhook ORDERING (pre-subscription event) [P3]
- [ ] Run a paid-invoice flow with **NO webhook configured** (assert no delivery, no error), THEN subscribe and run a **second** flow (assert delivery). **Document that past events are not back-filled.**

### Cumulative cross-flow REPUTATION [P3]
- [ ] Settle an invoice (rep tick #1, `screenAndSettle`) then release a cashout for the **same vendor** (rep tick #2, `cashoutAdvancer`) → read `/vendor/reputation` and assert on-chain `VendorReputation` reflects **both ticks cumulatively** — no double-count, no later-worker overwrite.

---

## II★.VERDICT — honest coverage statement (post-audit)

- **Pre-audit:** the plan asserted 100%. **Adversarial audit reality: ~82%**, "material-gaps" — strong on protocol/outcome/security/money-correctness, with **39 verified holes** in the Rabby-user UI / navigation / wallet-edge / readable-honesty layer.
- **Post-closure:** II★.1–II★.6 add every one of the 39 as a named, source-anchored check. With II★ green **and** the rest of Parts I+II green, coverage is genuinely complete for "a real Rabby user does/reads/combines everything."
- **The honest claim is conditional, not a rubber stamp:** the plan may state "100% covered" **only after** every box in Parts I, II, and II★ is executed against the source of truth at both viewports — and the CI coverage gate (Gate F5 / II.Z) is wired so the next new button/route/popup **fails the build until it has a check**. A one-time 82%→100% does not stay 100% without that gate.
- **Note for the next audit:** re-run the 6-dimension adversarial sweep whenever `AppShell.tsx`, `CommandPalette.tsx`, any `*OnChain`/`PayWith*`/`LinkForm` signing component, or the connector/wallet config changes — those are where coverage rots fastest.

---

# PART III — THIS SESSION'S INTEGRATIONS & DEPLOYMENT (2026-06-05)

> **Why this Part exists.** Part II★'s closing note said: re-run the audit whenever a
> `PayWith*`/signing component, connector, or wallet/deploy config changes. Between
> 2026-06-03 → 06-05 **six** new external surfaces landed *after* the last exhaustive
> pass, and a coverage grep proved the holes: **QuickBooks 0 · OFAC 0 · behavioral 0 ·
> DigitalOcean 0 · ERP_ENC_KEY 0 · Sumsub 1**. Until every box in Part III is green at
> both viewports, the "100% covered" claim is **void**.

## III.0 — What changed (the delta to re-test)
- **Screening behavior change (money-moving):** `screenAndSettle` went from *always-manual-review* → **real 3-of-3 with auto-settle**. Legs: sanctions = **OFAC** (real), KYB = **Sumsub** (real), behavioral = **testnet heuristic** (honest pass). Clean buyer + OFAC-clear + KYB-verified vendor now **releases USDC on-chain automatically**.
- **New surfaces:** MoonPay signed widget, QuickBooks OAuth connector, Sumsub KYB card on `/vendor/settings`.
- **Daemon host:** Railway → **DigitalOcean** (`.do/app.yaml`, app `klaro-daemon`).
- **Honesty pass:** user-facing copy changed (compliance claims, subprocessors, contact email, ERP count).

## III.1 — 💳 MoonPay card on-ramp — `apps/web/lib/moonpay.ts`
- [ ] On a hosted invoice `/i/[id]` with a buyer wallet that lacks USDC, the **"Card → USDC"** affordance appears.
- [ ] Clicking opens **`buy-sandbox.moonpay.com`** (sandbox, NOT production) in a new tab.
- [ ] 🔒 The URL carries a **`&signature=`** param (HMAC-SHA256 of the query, server-signed). Without it MoonPay rejects a prefilled `walletAddress` — assert the param is present and non-empty.
- [ ] `walletAddress` equals the **connected buyer address**; `currencyCode` + `baseCurrencyAmount` match the invoice.
- [ ] **Honest label:** the UI states this is sandbox/testnet and that MoonPay may not list `usdc_arc` (don't imply a completed on-ramp).
- [ ] Negative: with `MOONPAY_SECRET_KEY` unset the link still builds but **unsigned** — the path degrades without throwing, and the UI doesn't claim a working buy.
- [ ] 🔒 `MOONPAY_SECRET_KEY` is **server-only** — grep the client bundle: it must NOT appear (only `NEXT_PUBLIC_MOONPAY_PUBLIC_KEY` may).

## III.2 — 📒 QuickBooks ERP — `/api/integrations/quickbooks/{connect,callback}`, `lib/quickbooks.ts`, `apps/daemon/src/quickbooks.ts`
- [ ] `/vendor/integrations/erp` shows **QuickBooks** with a **live** badge + **Connect QuickBooks →** button (Xero/Tally remain "coming soon").
- [ ] **Connect** → Intuit OAuth consent → callback lands on `/vendor/integrations/erp?connected=QuickBooks` with a success banner.
- [ ] 🔒 **CSRF:** `connect` sets a state cookie; `callback` **rejects a mismatched/absent `state`** (forge a callback with a wrong state → must fail, no token stored).
- [ ] 🔒 **Token at rest is encrypted:** the `erp_connections` row's `auth_token_ciphertext` is AES-256-GCM (iv‖tag‖ciphertext base64), NOT plaintext. `realm_id` lives in `config_json`.
- [ ] 🔒 The shared **`ERP_ENC_KEY`** is identical on web (Vercel) and daemon (DO) — else the daemon can't decrypt. Assert parity.
- [ ] After an invoice **settles**, the daemon `erpSync` worker refreshes the token + **creates the invoice in the QuickBooks sandbox** (find-or-create customer first). Verify it appears in the `sandbox-quickbooks.api.intuit.com` company.
- [ ] **Reconnect** works (button shows when connected; re-running OAuth updates the token).
- [ ] Negative: callback with an Intuit `error` param → `?erp_error=...` banner, no crash.
- [ ] Negative (not configured): with `QUICKBOOKS_CLIENT_ID` unset, the connector renders but Connect fails **gracefully** (honest message, no 500).
- [ ] RLS: the `erp_connections` row is vendor-scoped (`vendor_id = current_vendor_id()`); a second vendor cannot read it.

## III.3 — 🪪 Sumsub KYB — `lib/sumsub.ts`, `app/(wallet)/vendor/settings/SumsubKyb.tsx`, `apps/daemon/src/sumsub.ts`
- [ ] `/vendor/settings` shows a **"Business verification (KYB)"** card with a status badge: **Not started / In review / Verified / Rejected**.
- [ ] **Verify business →** mints a short-lived WebSDK access token (server action `getKybTokenAction`) and **launches the Sumsub WebSDK** inline (client-only `dynamic` import — no SSR crash).
- [ ] 🔒 The token is **minted server-side** (HMAC-signed request); the secret never reaches the client. Token TTL is short (~600s) and `expirationHandler` re-mints.
- [ ] Applicant is keyed by **`externalUserId` = the Klaro vendor id** (so the daemon finds the same applicant at settle).
- [ ] Sandbox **GREEN** → card flips to **Verified** → screening KYB leg returns **pass**.
- [ ] Sandbox **RED** → **Rejected** → screening KYB leg returns **fail** → payment **blocked**.
- [ ] **Pending / none / unreachable** → KYB leg returns **review** (fail-closed — an unverified vendor's payment must HOLD, never auto-clear).
- [ ] Negative (not configured): with `SUMSUB_*` unset the card reads **"KYB isn't configured on this environment"** (no broken launcher).
- [ ] Honest label: nothing implies KYB is complete until the badge is actually **Verified**.

## III.4 — 🛡️ OFAC sanctions screening — `apps/daemon/src/ofac.ts`, `workers/sanctionsRefresh.ts`
- [ ] On boot the daemon logs **`ofac.refresh.ok {count:415}`** (the real OFAC SDN crypto-address list loaded — free, no key).
- [ ] A **clean** buyer → sanctions leg **pass** (`provider: "ofac.sanctions"`, evidence hash in `screening_results`).
- [ ] A **known-sanctioned** address → sanctions leg **fail** → payment **blocked** (`screening.fail`, admin notified). *(Use a test SDN address; no real funds needed.)*
- [ ] 🔒 **Fail-closed:** when the OFAC list is unavailable, the leg returns **review**, NOT pass (an outage must never auto-clear a payment).
- [ ] Daily refresh cron runs; **EU/UN are honestly skipped** (`[SIMULATED] sanctions.refresh.skipped`) — the logs/labels don't claim EU/UN are live.

## III.5 — 💰 3-of-3 screening → AUTO-SETTLE (the behavior change) [P0] — `workers/screenAndSettle.ts`
> This now **moves USDC on-chain**. Apply the Part 11 money-conservation rubric: assert on **contract balances + event amounts**, never signer-wallet deltas (Arc pays gas in native USDC).
- [ ] **Happy path:** clean buyer + OFAC-clear + **KYB-verified** vendor → all 3 legs pass → daemon signs `settle` → **escrow drained, vendor credited, 1% fee carved**, invoice → SETTLED, `/receipt/[hash]` verifies. *(This is the new auto-settle — previously everything held for review.)*
- [ ] **Unverified vendor** (KYB none/pending) → `screening.review` → invoice **HOLDS** (no settle, admin queued). Confirm no USDC moved.
- [ ] **Sanctioned buyer** → `screening.fail` → **blocked**, no settle.
- [ ] **RED vendor** → `screening.fail` → **blocked**.
- [ ] Behavioral leg = **testnet heuristic pass** with the honest detail string — verify it is NOT presented as a completed enterprise behavioral score.
- [ ] Each leg writes a `screening_results` row (provider + result + evidence hash). Three rows per screen.
- [ ] Idempotency: re-deliver the same screen job → **no double-settle** (BullMQ + on-chain guard).
- [ ] Reputation: an auto-settle records exactly **one** `VendorReputation` tick (no double-count with the cashout tick — see II★ cumulative-rep check).

## III.6 — 🚀 DigitalOcean daemon deployment & ops — `.do/app.yaml`, `apps/daemon/Dockerfile`
- [ ] The daemon boots clean on DO: logs **`daemon.ready {workers:12, listenerEnabled:true}`** (env validation passed — a missing required env must `process.exit(1)`, visible in the deploy log).
- [ ] 🐳 **Build:** the Dockerfile copies `packages/contracts/abis` (the fix this session) — a fresh build must succeed; regression-guard that the ABI import resolves.
- [ ] **Env parity:** the DO daemon carries the SAME `QUICKBOOKS_* / ERP_ENC_KEY / SUMSUB_* / contract addresses / REDIS_URL / SUPABASE_*` as Vercel. A drift silently breaks QBO push or KYB decrypt — assert parity.
- [ ] **deploy_on_push:** a push to `main` triggers an auto-rebuild on DO (verify a no-op commit redeploys).
- [ ] 🔴 **Failure mode — daemon down:** stop the worker, pay an invoice → it stays **PAID but never settles** (jobs queue in Redis). Restart → the **backlog drains** and settles. *(Proves the daemon is load-bearing and degrades safely, not silently.)*
- [ ] Both tiers required: web (Vercel) + daemon (DO) + DB (Supabase) + Redis (Upstash) all up = full flow. Document the dependency in the runbook.

## III.7 — 🧾 Honesty-fix verification (the copy corrected this session)
- [ ] Landing metric reads **"ERP connector live · QuickBooks" (1)**, NOT "3 ERPs live · Tally, QuickBooks, Xero".
- [ ] No page claims **SOC 2 / PCI / 99.9% uptime / 24×7 on-call** as *current* (Trust Center "in-progress" + roadmap "planned" + landing "audit underway" are the only acceptable framings).
- [ ] The status page has **no `@klaro_xyz` Twitter link**; no `status.klaro.so` presented as a live SLA endpoint.
- [ ] `/legal/subprocessors` lists the **real** set (Vercel, DigitalOcean, Supabase, Upstash, Circle, Resend, Sentry, PostHog, GrowthBook, MoonPay, Sumsub, Intuit) and does **not** list Railway / BetterStack / PagerDuty / unsigned fiat "pilots".
- [ ] Every contact/"email us" link is **`prateek@myklaro.app`** (no `@klaro.so`); input-example placeholders are neutral (`you@company.com`).
- [ ] Pricing tiers describe honest deliverables ("priority support + on-call (at GA)", "after SOC 2 audit (planned)") — no as-current enterprise-compliance claims.

## III.VERDICT — honest coverage statement (2026-06-05)
- Parts I + II + II★ remain valid for everything that existed before 2026-06-03. **Part III is mandatory** for this session's integrations + the auto-settle behavior change + the DO deploy.
- The plan may state **"100% covered" only after Parts I, II, II★ AND III are all executed** at both viewports, with the money-conservation rubric (Part 11) applied to III.5.
- **Coverage rots at the connector/signing/deploy edges** — the next time `moonpay.ts`, `sumsub.ts`, `quickbooks.ts`, `screenAndSettle.ts`, `ofac.ts`, or `.do/app.yaml` changes, Part III must be re-run.
