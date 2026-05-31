# Klaro Missing / Incomplete / Half-Wired Pieces Audit

**Generated:** 2026-05-31  
**Scope:** apps/web, apps/daemon, packages/contracts, packages/sdk  
**Method:** Grep markers + code read + migration cross-reference + env drift check

---

## 1. Money-Flow / Auth Critical (P0)

### [P0] Cashout submission throws in live mode — form renders but action rejects

- path: `apps/web/app/(wallet)/vendor/cashout/actions.ts:49-53`
- what's missing/incomplete: `createCashoutAction` immediately throws `cashout_submission_not_yet_live` when `supabaseLive() || isLiveOnChain()`. The `CashoutRequestForm` component renders a fully interactive form that lets the vendor fill all fields and click Submit — only to get an error. The on-chain `CashoutOrderProcessor.requestAndLock` call is never invoked from the web app.
- is it intentional (labeled sim) or a real gap? **Real gap** — the form should either be disabled or route to the on-chain path. The contract IS deployed (`0x4047…226c`), the daemon's `cashoutAdvancer` worker IS wired to advance state, but the web-side vendor-signing flow is missing.
- to finish: Wire `CashoutOrderProcessor.requestAndLock` call from the action when `CASHOUT_ORDER_PROCESSOR_ADDRESS` is set. Show "partner-pending" badge on the form when unset.

### [P0] Dispute decide/evidence/assign actions throw in live mode — admin UI is inert

- path: `apps/web/app/admin/disputes/actions.ts:58,117,144`
- what's missing/incomplete: All three admin dispute actions (`decideDisputeAction`, `requestEvidenceAction`, `assignToReviewAction`) throw `_not_yet_wired` / `_not_yet_persistent` when `isLiveOnChain()`. The admin can see disputes but cannot act on them. The daemon's `disputeResolver` worker IS wired to call `DisputeManager.decide` on-chain, but there's no admin-facing path to trigger it.
- is it intentional (labeled sim) or a real gap? **Real gap** — the daemon resolver handles post-decision fan-out, but the admin's initial `decide()` call has no live path. The mock store doesn't survive cold starts.
- to finish: Add an admin action that enqueues a `dispute-decide` job (operator wallet signs `DisputeManager.decide` on-chain), then the existing `disputeResolver` handles escrow fan-out.

### [P0] RETAINER_STREAM_ADDRESS missing from daemon .env.example

- path: `apps/daemon/src/env.ts:38` (declared in zod schema) vs `apps/daemon/.env.example` (absent)
- what's missing/incomplete: The daemon's env schema declares `RETAINER_STREAM_ADDRESS` as optional, and the `disputeResolver` worker uses it to call `RetainerStream.resolveDispute`. But it's missing from `.env.example`, so operators deploying from the example will have stream-context dispute resolutions silently fail (log warning + skip).
- is it intentional (labeled sim) or a real gap? **Real gap** — documentation drift. The contract IS deployed (`0xD689…360A`).
- to finish: Add `RETAINER_STREAM_ADDRESS=` to `apps/daemon/.env.example` alongside the other contract addresses.

### [P0] Webhook API route uses in-memory Map — contradicts repo layer

- path: `apps/web/app/api/v1/webhooks/route.ts:17-48`
- what's missing/incomplete: The `/api/v1/webhooks` route still uses a process-level `Map` and throws `webhooks_not_yet_available` in live mode. Meanwhile, `lib/repo/webhooks.ts` has a fully wired dual-mode implementation that reads/writes the `webhooks` table (migration 0035). The route doesn't use the repo.
- is it intentional (labeled sim) or a real gap? **Real gap** — the repo is wired, the migration exists, but the API route bypasses both and uses a dead in-memory store.
- to finish: Replace the route's in-memory Map with calls to `lib/repo/webhooks.ts` (createWebhook, listWebhooks). Remove the `liveModeNotAvailable()` guard.

---

## 2. Feature Stubs with UI Present (P1)

### [P1] LP notification/corridor preferences — no `lp_preferences` table

- path: `apps/web/app/lp/settings/actions.ts:48-51`, `apps/web/app/lp/settings/page.tsx:84,107`
- what's missing/incomplete: Toggle actions throw `lp_preferences_not_yet_shipped`. The page renders toggles with "Coming soon" badges. No migration creates an `lp_preferences` table.
- is it intentional (labeled sim) or a real gap? **Intentional** — honestly labeled. But it's a real missing table.
- to finish: Create migration `0043_lp_preferences.sql` with columns (lp_id, key, value, updated_at). Wire the actions.

### [P1] StableFX adapter worker is a no-op stub

- path: `apps/daemon/src/workers/stableFxAdapter.ts:22-30`
- what's missing/incomplete: The worker logs `[SIMULATED] fx.execute.skipped` with reason "Circle FxEscrow TEST access pending" and does nothing. The `fx_quotes` table (0042) and `lib/repo/fxQuotes.ts` persist quotes, but settlement never executes.
- is it intentional (labeled sim) or a real gap? **Intentional** — partner-pending (Circle FxEscrow access). Honestly labeled.
- to finish: Obtain Circle FxEscrow TEST credentials. Wire the worker to call `StableFXAdapterRegistry.execute` via the deployed `MockStableFXAdapter` (or real adapter when available).

### [P1] ERP integrations page — all connectors "planned", no OAuth

- path: `apps/web/app/(wallet)/vendor/integrations/erp/page.tsx:10-11`
- what's missing/incomplete: Page says "Live OAuth + push pipeline lands in M11." All connectors (Xero, QuickBooks, etc.) are status "planned". The daemon's `erpSync` worker exists but has no real provider integration.
- is it intentional (labeled sim) or a real gap? **Intentional** — honestly labeled as M11 work.
- to finish: Implement OAuth flow for at least one connector (Xero). Wire `erpSync` worker to push invoice data.

### [P1] Transit dashboard — hardcoded mock data

- path: `apps/web/app/(wallet)/vendor/transit/page.tsx:11`
- what's missing/incomplete: "Live data lands when the daemon's CCTP listener + Gateway poller are deployed (M11). For now: seeded mock pulls." The page renders hardcoded `SAMPLE` array.
- is it intentional (labeled sim) or a real gap? **Intentional** — honestly labeled. The daemon's `arcSubscriber` handles CCTP events but doesn't populate a transit table.
- to finish: Add a `cross_chain_transits` table + daemon handler for Gateway/CCTP events. Wire the page to read from it.

### [P1] Agent call API returns stub response

- path: `apps/web/app/api/agents/[agentId]/call/route.ts:54`
- what's missing/incomplete: Returns `"[${agent.displayName}] Stub response — wire to real agent backend in M11."` The agent marketplace UI exists but calling an agent does nothing.
- is it intentional (labeled sim) or a real gap? **Intentional** — labeled M11.
- to finish: Wire to real agent execution backend (ERC-8183 job creation + AgentEscrow funding).

### [P1] Admin pause route refuses on-chain execution

- path: `apps/web/app/api/admin/pause/route.ts:62-68`
- what's missing/incomplete: Returns `pause_not_yet_wired` — tells operator to "trigger pause out-of-band" directly against each Pausable contract. No programmatic emergency pause path exists.
- is it intentional (labeled sim) or a real gap? **Real gap for operations** — in an emergency, the operator must manually call each contract's `pause()`. No single-button kill switch.
- to finish: Wire the route to call `pause()` on all Pausable contracts via the operator wallet (or enqueue a daemon job that does it).

---

## 3. Env Var Drift (P1)

### [P1] Daemon env vars missing from .env.example

- path: `apps/daemon/src/env.ts` vs `apps/daemon/.env.example`
- what's missing/incomplete: `RETAINER_STREAM_ADDRESS` is in the zod schema but not in `.env.example`. Operators won't know to set it.
- is it intentional (labeled sim) or a real gap? **Real gap** — documentation drift.
- to finish: Add the line to `.env.example`.

### [P1] Web .env.example missing daemon-referenced vars

- path: `apps/web/.env.example` (no AGENT_ESCROW_ADDRESS, DISPUTE_MANAGER_ADDRESS, PAGERDUTY_INTEGRATION_KEY, VAPID_PRIVATE_KEY)
- what's missing/incomplete: The daemon references `AGENT_ESCROW_ADDRESS`, `DISPUTE_MANAGER_ADDRESS`, `RETAINER_STREAM_ADDRESS`, `PAGERDUTY_INTEGRATION_KEY`, and `VAPID_PRIVATE_KEY` — none appear in the web `.env.example`. While these are daemon-only, the web's `lib/env.ts` doesn't export them either, creating a split-brain where the daemon knows about contracts the web doesn't.
- is it intentional (labeled sim) or a real gap? **Partial gap** — the web doesn't need these for its own operation, but the DEPLOYMENT.md lists all contracts. The daemon's `.env.example` is the authoritative source but is incomplete (see above).
- to finish: Add `RETAINER_STREAM_ADDRESS` to daemon `.env.example`. Consider adding `NEXT_PUBLIC_AGENT_ESCROW_ADDRESS` and `NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS` to web `.env.example` for the agent/dispute pages that currently gate on `isLiveOnChain()`.

---

## 4. README / DEPLOYMENT Claims vs Reality (P2)

### [P2] README says "500 Foundry tests" — actual count is 520

- path: `README.md:12,29` (badge + stat table)
- what's missing/incomplete: Badge says "500 tests", stat table says "500", but `grep 'function test' packages/contracts/test/` finds 520 test functions. The repo description line says "504 Foundry tests". All three numbers disagree.
- is it intentional (labeled sim) or a real gap? **Stale copy** — tests were added after the badge was set.
- to finish: Update badge and stat table to 520 (or use a CI-generated count).

### [P2] README says "20 deployed contracts" — DEPLOYMENT.md lists 20, src/ has 22 .sol files

- path: `README.md:28`, `packages/contracts/src/` (22 .sol files including KlaroConfig, IACPHook, lib/ReasonCodes, adapters/*)
- what's missing/incomplete: The "20 deployed contracts" claim matches DEPLOYMENT.md (20 addresses). But the repo description says "22 Solidity contracts" which counts non-deployed files (KlaroConfig is a library, IACPHook is an interface, ReasonCodes is a library). The README table lists 20 contracts in the grid but the text says "Twenty contracts" — this is accurate for deployed.
- is it intentional (labeled sim) or a real gap? **Minor inconsistency** — "22 Solidity contracts" in the tree description vs "20 deployed" in the stat. Both are defensible but confusing.
- to finish: Clarify: "20 deployed contracts + 2 libraries + 2 adapters" or just say "22 Solidity source files".

### [P2] README says "screened…end to end" — screening is simulated

- path: `README.md:41`
- what's missing/incomplete: "Every dollar of value is escrowed, screened, and traceable end to end." But `sanctionsRefresh` worker logs `[SIMULATED] Chainalysis / TRM credentials are not yet wired`. The `screenAndSettle` worker does a deterministic pass (always approves) when no screening API key is set.
- is it intentional (labeled sim) or a real gap? **Overclaim** — the architecture supports screening, but no live screening provider is wired. The sentence implies it's operational.
- to finish: Qualify: "…screened (provider integration pending) and traceable end to end" or remove the claim until Chainalysis/TRM keys are live.

### [P2] README says "37 tables, RLS on every one" — actual CREATE TABLE count is 44

- path: `README.md:30`
- what's missing/incomplete: Grep finds 44 `CREATE TABLE` statements across migrations. Some may be `CREATE TABLE IF NOT EXISTS` duplicates or test tables, but the "37" figure is stale.
- is it intentional (labeled sim) or a real gap? **Stale copy** — tables were added (0040-0042 added 3 more).
- to finish: Update to actual count or use "40+" with a note that it grows with each migration.

---

## 5. Migration / Schema Gaps (P2)

### [P2] Migration 0009 is missing from the sequence

- path: `apps/web/supabase/migrations/` — jumps from 0008 to 0010
- what's missing/incomplete: No `0009_*.sql` file exists. Supabase runs migrations in lexicographic order so this is harmless, but it suggests a deleted or squashed migration.
- is it intentional (labeled sim) or a real gap? **Cosmetic** — no functional impact, but auditors may flag it.
- to finish: Document the gap or add a no-op `0009_placeholder.sql` with a comment.

### [P2] `database.types.ts` not regenerated for migrations 0040-0042

- path: `apps/web/lib/repo/delegations.ts:20-23`, `retainerStreams.ts:28-31`, `fxQuotes.ts:23-26`
- what's missing/incomplete: All three repos cast through `as unknown as SupabaseClient` with comments like "not in the generated Database type yet". This means TypeScript won't catch column name typos or type mismatches against these tables.
- is it intentional (labeled sim) or a real gap? **Real gap** — type safety is bypassed for 3 new tables.
- to finish: Run `supabase gen types typescript` to regenerate `database.types.ts` including the new tables.

### [P2] `lp_preferences` table referenced in code but no migration exists

- path: `apps/web/app/lp/settings/actions.ts:46`
- what's missing/incomplete: Code references `lp_preferences` table that doesn't exist in any migration. The actions throw rather than writing.
- is it intentional (labeled sim) or a real gap? **Intentional** — the throw is the honest-mode behavior. But it's a real missing migration.
- to finish: Create the migration when LP preferences ship.

---

## 6. Dead Code / Orphaned Pieces (P2-P3)

### [P2] KlaroConfig.MEMO address pinned but never called

- path: `packages/contracts/src/KlaroConfig.sol:89-101`
- what's missing/incomplete: `MEMO` address is declared with extensive NatSpec explaining it's "Pinned but not yet called from any contract." Scheduled for M11 alongside Elliptic/TRM integration. No contract imports or uses it.
- is it intentional (labeled sim) or a real gap? **Intentional** — documented as future work. But it's dead code in the deployed contracts.
- to finish: Wire `sendWithMemo` into fund-flow contracts when Elliptic/TRM integration ships, or remove the constant until then.

### [P3] `lib/i18n.ts` — 4 untranslated locales, no real i18n

- path: `apps/web/lib/i18n.ts:6-8`
- what's missing/incomplete: Comments say "M12 polish if a real i18n user lands" and "M11 ships" real locale support. Currently only `en` works; other locales fall back to English keys.
- is it intentional (labeled sim) or a real gap? **Intentional** — deferred to M12.
- to finish: Add translations for target locales when needed.

### [P3] `lib/auditLog.ts` — ClickHouse long-term retention not wired

- path: `apps/web/lib/auditLog.ts:5`
- what's missing/incomplete: Comment says "ClickHouse table (long-term retention; live wire = M12)". Currently audit logs go to Supabase only.
- is it intentional (labeled sim) or a real gap? **Intentional** — M12 scope.
- to finish: Wire ClickHouse adapter when long-term retention is needed.

### [P3] `lib/analytics.ts` — PostHog server-side is M11

- path: `apps/web/lib/analytics.ts:16`
- what's missing/incomplete: "Server-side analytics (PostHog Node SDK + queue worker) is M11." Client-side PostHog works when `NEXT_PUBLIC_POSTHOG_KEY` is set; server-side events are no-ops.
- is it intentional (labeled sim) or a real gap? **Intentional** — M11 scope.
- to finish: Wire PostHog Node SDK in the daemon or a server-side analytics worker.

### [P3] `CookieConsent.tsx` — PostHog opt-in/out not wired

- path: `apps/web/components/klaro/CookieConsent.tsx:29-30`
- what's missing/incomplete: "Wire to PostHog opt-in/out in M11. Today the consent is recorded locally and the daemon's analytics adapter is no-op until M11."
- is it intentional (labeled sim) or a real gap? **Intentional** — M11 scope.
- to finish: Call `posthog.opt_in_capturing()` / `posthog.opt_out_capturing()` based on consent state.

### [P3] `lib/testnetMetrics.ts` — hardcoded metrics, no live fetch

- path: `apps/web/lib/testnetMetrics.ts:9`
- what's missing/incomplete: "in M11 we swap this file's contents for a real fetch + cache pattern." Currently returns static numbers.
- is it intentional (labeled sim) or a real gap? **Intentional** — M11 scope.
- to finish: Replace with real Arc testnet event aggregation.

### [P3] `lib/corridors.ts` — indicative FX rate is hardcoded

- path: `apps/web/lib/corridors.ts:27`
- what's missing/incomplete: "Indicative rate (currency per 1 USDC). Replace with live oracle in M11." Rates are static constants.
- is it intentional (labeled sim) or a real gap? **Intentional** — M11 scope. Pyth oracle integration planned.
- to finish: Wire Pyth price feed for live FX rates.

### [P3] `lib/email.ts` — plain HTML templates, not React Email

- path: `apps/web/lib/email.ts:5`
- what's missing/incomplete: "M11 swaps to React Email." Currently uses inline HTML strings.
- is it intentional (labeled sim) or a real gap? **Intentional** — polish item.
- to finish: Migrate to React Email components.

---

## 7. Honest-Mode Surfaces That Are Correctly Labeled (Not Gaps)

These are NOT gaps — they are intentionally simulated/partner-pending and honestly labeled:

| Surface | Label | File |
|---------|-------|------|
| Cashout fiat leg | partner-pending | `app/(wallet)/vendor/cashout/[id]/page.tsx:105` |
| LP staking on-chain | partner-pending | `app/lp/stake/page.tsx:166` |
| Agent escrow on-chain | partner-pending | `app/(wallet)/vendor/agents/page.tsx:88` |
| Retainer vesting | simulated | `app/(wallet)/vendor/retainer/page.tsx:54` |
| Delegations enforcement | partner-pending | `app/(wallet)/vendor/delegations/page.tsx:58` |
| FX corridors (BRL, PHP) | partner-pending | `app/fx/[corridor]/page.tsx:25,41` |
| StableFX local rails | partner-pending | `app/product/stablefx/page.tsx:38` |
| Financing PDF export | M12 | `app/(wallet)/vendor/financing/page.tsx:133` |
| Status page health checks | M11 | `app/status/page.tsx:15` |

---

## Summary by Priority

| Priority | Count | Theme |
|----------|-------|-------|
| P0 | 4 | Money-flow actions throw in live mode; env drift; dead API route bypasses working repo |
| P1 | 8 | Feature stubs with UI present; env documentation gaps; admin operations missing |
| P2 | 7 | README overclaims; migration gaps; type safety bypassed |
| P3 | 7 | Deferred polish (i18n, analytics, email templates, oracle) — all honestly labeled |

**Total findings: 26**

---

## Recommended Immediate Actions (P0 only)

1. **Wire cashout vendor-signing flow** — the contract is deployed, the daemon advances, but the web action throws. This is the core value prop.
2. **Wire admin dispute decide** — enqueue `dispute-decide` job from admin action → daemon signs `DisputeManager.decide` → existing `disputeResolver` handles fan-out.
3. **Fix webhook route** — replace in-memory Map with existing `lib/repo/webhooks.ts` calls. The repo + migration are already done.
4. **Add `RETAINER_STREAM_ADDRESS` to daemon `.env.example`** — 1-line fix, prevents silent dispute resolution failures.
