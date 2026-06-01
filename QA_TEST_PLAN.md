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
