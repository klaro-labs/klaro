# D9 — Honest-Mode Integrity Audit

**Auditor:** d9_honest_mode  
**Date:** 2026-05-31  
**Scope:** apps/web/app/**, apps/web/lib/**, components/**, README/DEPLOYMENT claims  
**Lens:** Surfaces that look functional but silently no-op/fail in live mode, mock data leaking into live surfaces, missing/wrong mode labels, copy that overstates reality.

---

## Summary

Klaro's honest-mode architecture is **well-designed at the infrastructure layer** (env.ts, arcClient.ts, db.ts all have clean live/mock gates with explicit source labels). However, **several server actions and pages bypass the dual-mode repo pattern** and call mock functions directly regardless of whether Supabase/chain is live. This means a vendor in live mode performs writes that succeed in-memory but vanish on page reload (the exact defect class the DB team flagged). Additionally, the `verifyReceipt` simulated fallback returns `exists: true` — a lie that could mislead a third party inspecting a receipt URL.

**Critical findings:** 7  
**High findings:** 4  
**Medium findings:** 5  

---

## Findings

### [P0] LP actions write to mock store even when Supabase is live
- file: apps/web/app/lp/actions.ts:32,63,94,131
- lens: honest-mode
- what: `createInviteAction`, `submitApplicationAction`, `submitDocsAction`, `approveApplicationAction`, and `stakeAction` all call `mockUpdateLP` / `mockCreateLPInvite` directly — never through a dual-mode repo. When `SUPABASE_URL` is set (live mode), these writes go to the in-memory Map, succeed, revalidate the path, but the next SSR read from the DB returns stale/empty data. The LP sees their action "work" then the state reverts on refresh.
- why: No `lib/repo/lpProfiles.ts` dual-mode wrapper exists. The actions import directly from `mockData.ts`.
- fix: Create `lib/repo/lpProfiles.ts` with the standard `tryDb()` pattern (like cashouts.ts). Wire all LP actions through it. The `lp_profiles` table exists (migration 0004).
- confidence: 99% — verified by reading imports and confirming no conditional DB path exists.

---

### [P0] Retainer stream actions are mock-only — writes silently vanish in live mode
- file: apps/web/app/(wallet)/vendor/retainer/actions.ts:46,67,82
- lens: honest-mode
- what: `createStreamAction`, `withdrawStreamAction`, `cancelStreamAction` all call `mockCreateStream`, `mockWithdrawFromStream`, `mockCancelStream` directly. No dual-mode repo exists for streams. In live mode, vendor creates a stream → sees it → refreshes → it's gone. The `RetainerStream` contract is deployed on-chain (DEPLOYMENT.md) but the web layer never reads/writes the DB table.
- why: No `lib/repo/streams.ts` exists. The `retainer_streams` table exists (migration 0005) but is never queried.
- fix: Create `lib/repo/streams.ts` with `tryDb()` pattern. Wire actions through it.
- confidence: 99%

---

### [P0] FX corridor actions are mock-only — quotes vanish in live mode
- file: apps/web/app/fx/actions.ts:33,56
- lens: honest-mode
- what: `quoteAction` and `settleQuoteAction` call `mockCreateFxQuote` / `mockSettleFxQuote` directly. No dual-mode repo exists. In live mode, vendor requests a quote → sees it → refreshes → gone. The page itself has no "simulated" badge on the quote rows.
- why: No `lib/repo/fxQuotes.ts` exists. The `StableFXAdapterRegistry` contract is deployed but the web layer has no DB table or repo for quotes.
- fix: Either (a) create a repo + table for FX quotes, or (b) add a prominent `[SIMULATED]` badge on the /fx page explaining quotes are demo-only and do not persist. Currently the page renders quotes as if they're real with no mode indicator.
- confidence: 98%

---

### [P0] Delegation (session key) actions are mock-only — keys vanish in live mode
- file: apps/web/app/(wallet)/vendor/delegations/actions.ts:38,60
- lens: honest-mode
- what: `createSessionKeyAction` and `revokeSessionKeyAction` call `mockCreateSessionKey` / `mockRevokeSessionKey` directly. No dual-mode repo exists. In live mode, vendor creates a delegation → sees it → refreshes → gone.
- why: No `lib/repo/sessionKeys.ts` exists. The delegations page does show a badge (`circleVendorLive() ? "live" : "sim"`) but the badge gates on Circle Wallets availability, not on whether the write actually persists. A vendor with Circle Wallets configured but no session-key table would see "live" badge + ephemeral data.
- fix: Create `lib/repo/sessionKeys.ts` or ensure the badge accurately reflects that writes are mock-only.
- confidence: 97%

---

### [P0] Vendor settings page reads from mock store even in live mode
- file: apps/web/app/(wallet)/vendor/settings/page.tsx:11
- lens: honest-mode
- what: `const v = (await mockGetVendor(session.vendor.id)) ?? session.vendor;` — the page always reads from the mock store first. If the mock store has stale data (e.g. from a previous simulated session), it will display that instead of the live DB row. The `settings/actions.ts` correctly routes writes to the live DB (line 35), but the read path doesn't.
- why: The page should use `getVendorById` from `lib/repo/vendors.ts` (which has proper dual-mode), not `mockGetVendor`.
- fix: Replace `mockGetVendor(session.vendor.id)` with `getVendorById(session.vendor.id)` from the repo.
- confidence: 95%

---

### [P0] `verifyReceipt` simulated fallback returns `exists: true` — lies to verifiers
- file: apps/web/lib/arcClient.ts:178
- lens: honest-mode
- what: When `AUDIT_RECEIPT_ADDRESS` is unset, `verifyReceipt()` returns `{ source: "simulated", exists: true, anchor: null }`. The receipt page at `/receipt/[hash]` uses this to decide whether to show the receipt. A third party visiting a receipt URL when the contract address is unset sees a page that says "Stenn-Proof · Simulated" but the underlying function claims the receipt *exists*. This is a semantic lie — the receipt does NOT exist on-chain; the function should return `exists: false` with `source: "simulated"`.
- why: The receipt page does show a "Simulated" badge, so the UI is partially honest. But the API-level contract (`exists: true`) is wrong and could mislead SDK consumers or the receipt-badge embed component.
- fix: Return `{ source: "simulated", exists: false, anchor: null }`. Let the receipt page decide to show the simulated preview based on `source === "simulated"` rather than `exists`.
- confidence: 90%

---

### [P0] `mockComputeBalances` used on live vendor dashboard — no "simulated" label on balance figures
- file: apps/web/app/(wallet)/vendor/page.tsx:43
- lens: honest-mode
- what: The vendor dashboard always calls `mockComputeBalances(invoices)` to derive the balance breakdown. This is a pure computation (derives from invoice statuses), so it's not a persistence issue — but the BalanceCard renders "Testnet · USDC" without distinguishing whether the balances are derived from live DB invoices vs. mock invoices. When `session.simulated` is true, the page shows a "Simulated session" badge at the top, but when the session is live (real Supabase auth), the balances still come from the same mock computation with no indication that they're a derived estimate, not an on-chain read.
- why: `mockComputeBalances` is a pure function that sums invoice amounts by status. It's not reading mock data — it's computing from whatever invoices are passed. The naming is misleading but the behavior is correct. However, the BalanceCard's "Testnet · USDC" label is the only mode indicator, and it doesn't distinguish "computed from live DB" vs "computed from mock store".
- fix: Rename `mockComputeBalances` → `computeBalances` (it's not mock-specific). Add a note in the BalanceCard that these are derived from invoice state, not an on-chain balance read. Low severity since the computation is correct.
- confidence: 75% (borderline — the function is pure, just poorly named)

---

### [HIGH] LP settings wallet update is mock-only in live mode
- file: apps/web/app/lp/settings/actions.ts:27
- lens: honest-mode
- what: `mockUpdateLP(lp.lpId, { wallet: next as Hex })` — LP payout wallet update goes to mock store only. In live mode, LP sets their payout wallet → it appears saved → refresh → gone. When a cashout is claimed, the daemon would read the LP's wallet from the DB (which was never written) and either fail or pay to a stale/null address.
- why: Same root cause as P0 #1 — no LP repo with dual-mode.
- fix: Part of the LP repo creation fix.
- confidence: 99%

---

### [HIGH] Agent registry reads are mock-only — `mockGetAgent` / `mockListAgents` in live mode
- file: apps/web/app/(wallet)/vendor/agents/actions.ts:44 and apps/web/app/(wallet)/vendor/agents/page.tsx:8
- lens: honest-mode
- what: `createJobAction` calls `mockGetAgent(agentId)` to validate the agent exists and is active. The agents page calls `mockListAgents()`. The `AgentRegistry` contract is deployed on-chain but the web layer never reads it. In live mode, the agent list is always the hardcoded mock set — a vendor cannot interact with agents registered on-chain but not in the mock seed.
- why: No `lib/repo/agents.ts` that reads from the on-chain `AgentRegistry` or a DB mirror.
- fix: Create an agent registry reader that queries the on-chain contract (or a DB mirror populated by the daemon). Add a mode badge on the agents page.
- confidence: 95%

---

### [HIGH] `createCashoutAction` throws in live mode — but the UI still renders the form
- file: apps/web/app/(wallet)/vendor/cashout/actions.ts:46-49
- lens: honest-mode
- what: `createCashoutAction` immediately throws `"cashout_submission_not_yet_live"` when `supabaseLive() || isLiveOnChain()`. The cashout page renders the `CashoutRequestForm` component which lets the vendor fill in all fields and click Submit — only to get an error. The form should either be hidden or show a clear "not yet available in live mode" state BEFORE the user fills it in.
- why: The `CashoutRequestForm` component does have a live-mode path (`RequestCashoutOnChain`) that uses `prepareCashoutRequestAction` + `recordCashoutRequestedAction` (which work in live mode). But the simulated-path form still renders and its submit handler calls the throwing action. The component needs to gate which path is shown based on `isLiveOnChain()` + `CASHOUT_ORDER_PROCESSOR_ADDRESS`.
- fix: Verify that `CashoutRequestForm` correctly routes to the on-chain path when live. If `CASHOUT_ORDER_PROCESSOR_ADDRESS` is unset (it IS unset in .env.local), the form should show "partner-pending" instead of a functional-looking form that throws on submit.
- confidence: 85% (need to verify the component's branching logic)

---

### [HIGH] `openDisputeAction` (cashout) throws in live mode with no pre-submit indication
- file: apps/web/app/(wallet)/vendor/cashout/actions.ts:218-220
- lens: honest-mode
- what: `openDisputeAction` throws `"Live dispute opening requires an onchain transaction; simulator writes are disabled in live mode."` when live. The cashout detail page renders a "Dispute" button that looks functional but errors on click.
- why: The on-chain dispute path (vendor signs `DisputeManager.openDispute`) isn't wired yet. The button should be disabled or show "Coming soon" in live mode.
- fix: Conditionally disable the dispute button or show an "access pending" badge when `isLiveOnChain()` and the on-chain dispute path isn't wired.
- confidence: 90%

---

### [MED] README claims "500 Foundry tests" — actual count may differ
- file: README.md:8
- lens: honest-mode
- what: The README badge says "500 tests" and the stats table says "500 Foundry tests". This is a static claim that could drift as tests are added/removed. The CI badge is dynamic but the test count badge is hardcoded.
- why: Hardcoded marketing number. If tests were added (the contracts dir shows active development), the number is understated. If tests were removed, it's overstated.
- fix: Either make the badge dynamic (read from CI output) or add a note "500+" or remove the exact count. Low priority but violates the "never overclaim" principle.
- confidence: 70% (can't verify exact count without running forge test)

---

### [MED] README claims "20 deployed contracts" — DEPLOYMENT.md shows 20 but includes MockStableFXAdapter
- file: README.md stats table
- lens: honest-mode
- what: The "20 deployed contracts" count includes `MockStableFXAdapter` which is explicitly a mock/test adapter. The contracts table in README lists 20 contracts but `MockStableFXAdapter` isn't in that table — it's only in DEPLOYMENT.md. The README table shows 20 production contracts; DEPLOYMENT.md shows 20 deployed addresses (19 real + 1 mock).
- why: Minor inconsistency. The mock adapter is deployed on-chain (it's a real contract) but calling it a "deployed contract" in the same breath as production contracts is slightly misleading.
- fix: Clarify "19 protocol contracts + 1 mock adapter" or just say "19 contracts".
- confidence: 80%

---

### [MED] `CASHOUT_ORDER_PROCESSOR_ADDRESS` not in .env.local — live cashout path is dead
- file: apps/web/.env.local (missing), apps/web/lib/env.ts:79
- lens: honest-mode
- what: `NEXT_PUBLIC_CASHOUT_ORDER_PROCESSOR_ADDRESS` is not set in `.env.local` despite the contract being deployed (DEPLOYMENT.md: `0x4047ecf1f67dE098aF919bD2Ce9137b4414d226c`). This means `recordCashoutRequestedAction` (the live on-chain cashout path) will always throw "cashout processor address not configured" even though the contract exists. The testnet deployment is incomplete — the address was deployed but never wired into the app config.
- why: Likely an oversight during the deploy script run — other addresses (InvoiceEscrow, AuditReceipt, etc.) were added but CashoutOrderProcessor was missed.
- fix: Add `NEXT_PUBLIC_CASHOUT_ORDER_PROCESSOR_ADDRESS=0x4047ecf1f67dE098aF919bD2Ce9137b4414d226c` to `.env.local`.
- confidence: 99%

---

### [MED] `LINK_PUBLISHER_PRIVATE_KEY` not set — link payments always run simulator
- file: apps/web/.env.local (missing), apps/web/lib/env.ts:131
- lens: honest-mode
- what: `LINK_PUBLISHER_PRIVATE_KEY` is not set in `.env.local`. This means `linkPublisherLive()` always returns false, and `getOrCreateLinkInvoice` always returns `onChain: "simulator"`. Payment links never publish invoices on-chain even though `InvoiceEscrow` is deployed and configured. The `/pay/[slug]` page shows a functional payment flow but the invoice is never anchored on-chain.
- why: The relayer wallet needs to be funded and its key configured. This is documented in `.env.example` but not wired.
- fix: Generate a relayer wallet, fund it with testnet USDC for gas, set the key. Until then, the link pay page should show a "simulated" badge (it does via `PayFromLink` component which checks `isLive` — verify this renders correctly).
- confidence: 95%

---

### [MED] Reputation page always reads mock events even in live mode
- file: apps/web/app/(wallet)/vendor/reputation/page.tsx:56
- lens: honest-mode
- what: `const events = await mockListReputationEvents(session.vendor.id)` — the event log is always mock data. The page correctly reads the live score from `readReputationScore()` when the contract is deployed, but the event history below it is always the seeded mock events. A vendor in live mode sees real score + fake event history. The page does show a "Live · Arc" badge for the score section but the events section has no separate mode indicator.
- why: No repo or on-chain reader for `VendorReputation` events (would need to scan logs from the contract). The mock events are seeded demo data.
- fix: Either (a) add an event log reader that scans `VendorReputation` contract events, or (b) add a clear "[SIMULATED]" badge specifically on the event log section (separate from the score badge which correctly shows "Live · Arc").
- confidence: 95%

---

## Cross-Reference: README Claims vs. Reality

| README Claim | Actual Status | Honest? |
|---|---|---|
| "Vendor signup + invoice creation" ✅ | Live (Supabase + on-chain publish) | ✅ Yes |
| "Buyer payment" ✅ | Live when InvoiceEscrow is set | ✅ Yes |
| "On-chain audit receipt" ✅ | Live when AuditReceipt is set | ✅ Yes |
| "LP staking + partner cashout" ✅ | **Mock-only writes** (P0 #1) | ❌ Overstated |
| "Agent jobs" ✅ | Agent registry is mock-only; job repo is dual-mode | ⚠️ Partially |
| "Cross-chain pay-in" ✅ | MultiChainRouter deployed but no daemon listener wired | ⚠️ Contract exists, flow untested |
| "StableFX corridors" ✅ | Mock-only quotes (P0 #3) | ❌ Overstated |
| "Disputes" ✅ | Dual-mode repo works; cashout dispute opening throws in live | ⚠️ Partially |

---

## Recommendations

1. **Immediate (P0):** Create `lib/repo/lpProfiles.ts`, `lib/repo/streams.ts`, `lib/repo/fxQuotes.ts`, `lib/repo/sessionKeys.ts` with the standard `tryDb()` dual-mode pattern. Wire all actions through them.
2. **High:** Fix `verifyReceipt` simulated return to `exists: false`.
3. **High:** Add `NEXT_PUBLIC_CASHOUT_ORDER_PROCESSOR_ADDRESS` to `.env.local`.
4. **Medium:** Add per-section mode badges on pages that mix live reads with mock reads (reputation events, agent list).
5. **Medium:** Rename `mockComputeBalances` → `computeBalances` since it's a pure function used in both modes.
6. **Low:** Make the "500 tests" badge dynamic or approximate.
