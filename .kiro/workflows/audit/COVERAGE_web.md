# Klaro Web Test-Coverage Audit

**Generated:** 2026-05-31  
**Scope:** `apps/web/lib/repo/*` (19 repos), server actions (24 files), API routes (26 routes), test files (28)

---

## Summary Table: Repo Coverage

| Repo | Has Test? | Live Branch (`tryDb`) Tested? | Notes |
|------|-----------|-------------------------------|-------|
| `agentJobs` | ⚠️ Indirect | ❌ No | `agentJobStateMachine.test.ts` mocks `tryDb→null`, tests action layer only |
| `auditLogs` | ❌ No | ❌ No | Append-only via `serviceDb()`, zero tests |
| `cashouts` | ⚠️ Indirect | ❌ No | `cashoutToctouRace.test.ts` tests mock functions directly, not repo |
| `counterpartyCache` | ❌ No | ❌ No | Read-only, low risk |
| `delegations` | ❌ No | ❌ No | **NEW (0040)** — zero tests, auth-critical |
| `disputes` | ✅ Yes | ❌ No | `disputesRepo.test.ts` mocks `tryDb→null` explicitly |
| `fxQuotes` | ❌ No | ❌ No | **NEW (0042)** — zero tests |
| `invoices` | ❌ No | ❌ No | Core money repo, no direct test |
| `kpiSnapshots` | ❌ No | ❌ No | Read-only, low risk |
| `links` | ❌ No | ❌ No | Payment links — money-adjacent |
| `lp` | ❌ No | ❌ No | **NEW dual-mode** — LP staking/invite, zero tests |
| `lpMembers` | ❌ No | ❌ No | Auth-critical (LP identity resolution) |
| `lpReputation` | ❌ No | ❌ No | Read-only |
| `protocolLimits` | ❌ No | ❌ No | Read-only |
| `receipts` | ❌ No | ❌ No | Public read, low risk |
| `retainerStreams` | ❌ No | ❌ No | **NEW (0041)** — money flow (withdraw/cancel), zero tests |
| `team` | ❌ No | ❌ No | **NEW** — RBAC mutations, zero tests |
| `vendors` | ❌ No | ❌ No | Auth-critical (session resolution) |
| `webhooks` | ❌ No | ❌ No | **NEW** — signing secret creation, zero tests |

**Key finding:** Only 1 of 19 repos (`disputes`) has a direct test, and even that test forces `tryDb→null` (mock mode). **Zero repos have their live Supabase branch tested.** Every `tryDb()` → Supabase path is untested.

---

## Summary Table: Server Actions Coverage

| Action File | Has Test? | Notes |
|-------------|-----------|-------|
| `vendor/cashout/actions.ts` | ❌ No | Money-critical: `createCashoutAction` |
| `i/[id]/actions.ts` | ✅ Guard only | `simulatePaymentGuard.test.ts` tests the fail-closed gate, not the happy path |
| `vendor/agents/actions.ts` | ✅ Yes | `agentJobStateMachine.test.ts` — good coverage |
| `vendor/delegations/actions.ts` | ❌ No | Auth-critical: session key create/revoke |
| `vendor/invoices/new/actions.ts` | ❌ No | Money-critical: `createInvoiceAction` |
| `vendor/invoices/recurring/actions.ts` | ❌ No | |
| `vendor/retainer/actions.ts` | ❌ No | Money: stream create/withdraw/cancel |
| `vendor/team/actions.ts` | ❌ No | RBAC: invite/change-role/remove |
| `vendor/cashout/actions.ts` | ❌ No | |
| `vendor/disputes/actions.ts` | ❌ No | |
| `vendor/exports/actions.ts` | ❌ No | |
| `vendor/integrations/webhooks/actions.ts` | ❌ No | |
| `vendor/links/new/actions.ts` | ❌ No | |
| `vendor/links/[id]/actions.ts` | ❌ No | |
| `vendor/settings/actions.ts` | ❌ No | |
| `vendor/bills/[id]/actions.ts` | ❌ No | |
| `pay/[slug]/actions.ts` | ❌ No | Money: payment-link pay flow |
| `lp/actions.ts` | ❌ No | Money: LP staking, cashout claim |
| `lp/disputes/actions.ts` | ❌ No | Auth: LP evidence submission |
| `lp/settings/actions.ts` | ❌ No | |
| `admin/disputes/actions.ts` | ❌ No | Operator: dispute decision |
| `fx/actions.ts` | ❌ No | FX quote/settle |
| `onboarding/actions.ts` | ❌ No | |
| `account/privacy/actions.ts` | ❌ No | |
| `company/contact/actions.ts` | ❌ No | |

---

## Summary Table: API Routes Coverage

| Route | Has Test? | Notes |
|-------|-----------|-------|
| `api/admin/pause` | ❌ No | **P0**: operator emergency pause |
| `api/agents/[agentId]/call` | ❌ No | Agent invocation |
| `api/auth/magic` | ❌ No | **P0**: magic-link auth + redirect validation |
| `api/cron/lifecycle-reminders` | ✅ Yes | `lifecycleCronMultiVendor.test.ts` |
| `api/health` | ❌ No | Low risk |
| `api/moonpay/buy` | ❌ No | **P1**: open-redirect fix, wallet validation |
| `api/openapi` | ✅ Yes | `openapiSpecShape.test.ts` |
| `api/status` | ❌ No | Low risk |
| `api/v1/cashouts` | ❌ No | **P0**: cashout create/list |
| `api/v1/cashouts/quotes` | ✅ Partial | `cashoutQuote.test.ts` tests hash, not route |
| `api/v1/disputes` | ❌ No | **P0**: dispute open |
| `api/v1/fx/quotes` | ❌ No | FX quote API |
| `api/v1/invoices` | ❌ No | **P0**: invoice create/list |
| `api/v1/invoices/[id]` | ❌ No | Invoice get |
| `api/v1/push/subscriptions` | ❌ No | |
| `api/v1/receipts/[hash]` | ❌ No | Public receipt |
| `api/v1/webauthn/assert/options` | ❌ No | **P0**: passkey auth |
| `api/v1/webauthn/assert/verify` | ❌ No | **P0**: passkey auth |
| `api/v1/webauthn/register/options` | ❌ No | **P0**: passkey registration |
| `api/v1/webauthn/register/verify` | ❌ No | **P0**: passkey registration |
| `api/v1/webhooks` | ❌ No | Webhook CRUD |
| `api/webhooks/cctp` | ✅ Indirect | `webhookReceiver.test.ts` tests the shared receiver |
| `api/webhooks/circle` | ✅ Indirect | Same shared receiver |
| `api/webhooks/erp` | ✅ Indirect | Same shared receiver |
| `api/webhooks/gateway` | ✅ Indirect | Same shared receiver |
| `api/webhooks/stripe` | ✅ Indirect | Same shared receiver |

---

## Detailed Gaps

### [P0] `retainerStreams` repo — untested money flow
- **path:** `apps/web/lib/repo/retainerStreams.ts`
- **what's untested:** `withdrawFromStream` (lines 97-113) — computes withdrawable ceiling, updates `withdrawn_usdc`. `cancelStream` (lines 116-133) — freezes vesting, pro-rata refund logic.
- **risk if it breaks:** Over-withdrawal drains stream beyond vested amount. Cancel could freeze wrong vested amount, locking or releasing excess USDC.
- **test to add:** Unit test seeding a stream via `createStream`, advancing time, asserting `withdrawFromStream` respects vesting ceiling, rejects over-withdrawal, and `cancelStream` freezes at correct vested amount. Test both mock and live (mocked Supabase client) branches.

---

### [P0] `delegations` repo — untested auth surface
- **path:** `apps/web/lib/repo/delegations.ts`
- **what's untested:** `createSessionKey` (line 53), `revokeSessionKey` (line 76) — entire CRUD. The action layer validates scope enum but the repo's live branch (Supabase insert/update on `session_keys`) is never tested.
- **risk if it breaks:** Delegation persists with wrong `vendor_id` → cross-tenant key issuance. Revoke fails silently → key remains active after user believes it's revoked.
- **test to add:** Test `createSessionKey` round-trips correctly, `revokeSessionKey` sets `revoked_at`, `listSessionKeys` excludes revoked keys. Verify `vendor_id` scoping.

---

### [P0] `cashouts` repo — no direct test, TOCTOU only tested at mock level
- **path:** `apps/web/lib/repo/cashouts.ts`
- **what's untested:** `createCashout` live branch, `advanceCashout` with `requireFromStatus` precondition against real Supabase. The `cashoutToctouRace.test.ts` tests `mockAdvanceCashout` directly — never the repo wrapper.
- **risk if it breaks:** `advanceCashout` live branch could skip the atomic `eq("status", fromStatus)` precondition → double-claim race re-opens. `numericToBigInt` could fail on unexpected PostgREST format.
- **test to add:** Integration test with mocked Supabase client verifying the `.eq("status", fromStatus)` clause is emitted. Unit test for `numericToBigInt` edge cases (string vs number, decimal suffix).

---

### [P0] `invoices` repo — core money path untested
- **path:** `apps/web/lib/repo/invoices.ts`
- **what's untested:** `createInvoice`, `advanceInvoiceStatus`, `listInvoicesForVendor` — the entire repo. The vendor wallet join (`vendors!inner(wallet)`) that prevents the 0x0 bug is untested.
- **risk if it breaks:** Invoice created with null vendor wallet → buyer pays to zero address. Status advance without precondition → double-settle.
- **test to add:** Test `fromRow` correctly maps `vendors.wallet` to `Invoice.vendorWallet` (null case + valid case). Test `createInvoice` rejects when wallet is null.

---

### [P0] WebAuthn routes — zero test coverage on passkey auth
- **path:** `apps/web/app/api/v1/webauthn/register/verify/route.ts` (and 3 siblings)
- **what's untested:** Entire passkey registration + assertion flow. The `verifyRegistrationResponse` call, credential storage, counter validation.
- **risk if it breaks:** Broken registration stores invalid credential → user locked out. Broken assertion accepts any authenticator → auth bypass.
- **test to add:** Mock `@simplewebauthn/server` responses, test that valid attestation stores correct `credentialPublicKey`, invalid attestation returns 400, counter replay is rejected.

---

### [P0] `api/auth/magic` — auth + open-redirect
- **path:** `apps/web/app/api/auth/magic/route.ts`
- **what's untested:** The `safeRedirect` validation logic (open-redirect fix), the Supabase OTP proxy, rate-limit integration.
- **risk if it breaks:** Open redirect re-introduced → session theft via magic link. Rate limit bypass → project-wide Supabase DoS.
- **test to add:** Test `safeRedirect` rejects `//evil.com`, `\evil.com`, absolute URLs to non-allowlisted hosts. Test valid same-origin paths pass through.

---

### [P0] `api/admin/pause` — operator emergency control
- **path:** `apps/web/app/api/admin/pause/route.ts`
- **what's untested:** `requireOperator` gate, reason-code enum validation, the live-mode refusal (503 when no on-chain `pause()` is wired).
- **risk if it breaks:** Non-operator can pause (DoS). Operator believes pause succeeded but escrows keep accepting (false confidence during incident).
- **test to add:** Test `requireOperator` rejects non-operator sessions. Test invalid `reasonCode` is rejected. Test live-mode returns 503.

---

### [P0] `createCashoutAction` — money-critical server action
- **path:** `apps/web/app/(wallet)/vendor/cashout/actions.ts`
- **what's untested:** Quote-hash verification (`expectedQuoteHash` match), expiry check, `parseSafeUsdcBigint` integration, the live-mode gate.
- **risk if it breaks:** Tampered quote params accepted → vendor receives wrong payout. Expired quote accepted → stale rate locks funds.
- **test to add:** Test that mismatched `expectedQuoteHash` throws. Test expired `quoteExpiresAtIso` throws. Test `parseSafeUsdcBigint` rejects Infinity/NaN/negative.

---

### [P0] `createInvoiceAction` — money-critical server action
- **path:** `apps/web/app/(wallet)/vendor/invoices/new/actions.ts`
- **what's untested:** `assertVendorWalletProvisioned` integration, `assertSafeUSDAmount` edge cases, deterministic invoice ID generation.
- **risk if it breaks:** Invoice created with zero-address wallet → buyer's USDC locked irrecoverably. Duplicate invoice IDs under load.
- **test to add:** Test action throws when vendor wallet is null/zero. Test deterministic ID is stable for same inputs, different for different inputs.

---

### [P1] `lp` repo — LP staking mutations untested
- **path:** `apps/web/lib/repo/lp.ts`
- **what's untested:** `updateLp` (status transitions, `stakedUsdc` ÷ 1M conversion), `createLpInvite`, `dbStatusToApp` mapping.
- **risk if it breaks:** `stakedUsdc` stored wrong (off by 10^6) → LP appears to have staked 0 or 10^12. Status mapping error → LP stuck in wrong state.
- **test to add:** Test `dbStatusToApp` round-trips all enum values. Test `updateLp` divides `stakedUsdc` by 1M on write. Test `APP_TO_DB` mapping covers all app statuses.

---

### [P1] `team` repo — RBAC mutations untested
- **path:** `apps/web/lib/repo/team.ts`
- **what's untested:** `inviteTeammate`, `changeRole`, `removeTeammate` — entire CRUD. Role enum mapping (`TO_DB`/`FROM_DB`).
- **risk if it breaks:** Role stored as wrong DB enum → teammate gets elevated/reduced permissions silently. `removeTeammate` fails → removed user retains access.
- **test to add:** Test `inviteTeammate` stores correct role mapping. Test `removeTeammate` sets `removed_at`. Test `listTeam` excludes removed members.

---

### [P1] `webhooks` repo — signing secret creation untested
- **path:** `apps/web/lib/repo/webhooks.ts`
- **what's untested:** `createWebhook` RPC call (`webhook_create`), `deactivateWebhook` soft-delete, `recordDelivery` best-effort insert.
- **risk if it breaks:** Webhook created without signing secret → deliveries unsigned → vendor can't verify authenticity. Deactivate fails → deleted webhook keeps firing.
- **test to add:** Test `createWebhook` returns a signing secret on success. Test `deactivateWebhook` sets status='deleted'. Test `listWebhooks` excludes deleted.

---

### [P1] `fxQuotes` repo — FX settlement untested
- **path:** `apps/web/lib/repo/fxQuotes.ts`
- **what's untested:** `createFxQuote` (BigInt serialization), `settleFxQuote` (vendor_id scoping, idempotency — can't re-settle).
- **risk if it breaks:** `settleFxQuote` without vendor_id check → cross-tenant settlement. BigInt stored as lossy number → amount corruption.
- **test to add:** Test `settleFxQuote` rejects when `vendorId` doesn't match. Test already-settled quote returns current state (idempotent). Test BigInt round-trip through `big()`.

---

### [P1] `lpMembers` repo — LP identity resolution untested
- **path:** `apps/web/lib/repo/lpMembers.ts`
- **what's untested:** `getPrimaryLpForVendor` — the join from `lp_members` → `lp_profiles`. This is the auth seam for all LP actions.
- **risk if it breaks:** Wrong LP resolved → LP A can claim LP B's cashout orders, submit evidence on LP B's disputes.
- **test to add:** Test that `getPrimaryLpForVendor` returns the correct LP for a given vendor. Test returns null when vendor has no LP membership.

---

### [P1] `vendors` repo — session resolution untested
- **path:** `apps/web/lib/repo/vendors.ts`
- **what's untested:** `getVendorBySupabaseUserId` — the auth.uid() → Vendor mapping. Wallet null-passthrough.
- **risk if it breaks:** Wrong vendor resolved → complete tenant isolation failure. Null wallet coerced to "0x0" → downstream zero-address bugs.
- **test to add:** Test `fromRow` passes null wallet through (not "0x0"). Test lookup by Supabase UID returns correct vendor.

---

### [P1] `api/v1/disputes` — cross-tenant ownership gate untested
- **path:** `apps/web/app/api/v1/disputes/route.ts`
- **what's untested:** The ownership verification (resolve source object, verify `vendorId` matches session). The exhaustiveness guard for new source types.
- **risk if it breaks:** Attacker opens disputes against other vendors' cashouts/jobs/streams → case file pollution, reputation damage.
- **test to add:** Test that POST with a `sourceId` owned by a different vendor returns 403. Test unknown source type is rejected.

---

### [P1] `api/moonpay/buy` — open-redirect + zero-address
- **path:** `apps/web/app/api/moonpay/buy/route.ts`
- **what's untested:** `safeRedirectTarget` logic, wallet-address validation in live mode.
- **risk if it breaks:** Open redirect re-introduced → phishing. Zero-address wallet in live mode → buyer's card payment funds 0x0.
- **test to add:** Test redirect rejects absolute URLs to non-allowlisted hosts. Test live mode rejects missing/zero wallet address.

---

### [P1] LP server actions — staking + cashout claim untested
- **path:** `apps/web/app/lp/actions.ts`
- **what's untested:** `submitApplicationAction` (wallet validation), `stakeAction`, `claimCashoutAction`, `createInviteAction` (operator gate).
- **risk if it breaks:** LP stakes with zero-address wallet → USDC locked. LP claims cashout without proper LP resolution → cross-LP claim.
- **test to add:** Test `submitApplicationAction` rejects zero-address and malformed wallets. Test `createInviteAction` requires operator role.

---

### [P1] `vendor/retainer/actions.ts` — stream money actions untested
- **path:** `apps/web/app/(wallet)/vendor/retainer/actions.ts`
- **what's untested:** `createStreamAction`, `withdrawStreamAction`, `cancelStreamAction` — all three auth-gated money actions.
- **risk if it breaks:** Stream created with zero-address recipient → USDC lost. Withdraw without ownership check → cross-tenant drain.
- **test to add:** Test `createStreamAction` requires vendor session + provisioned wallet. Test `withdrawStreamAction` rejects when stream belongs to different vendor.

---

### [P2] `agentJobs` repo — live branch untested
- **path:** `apps/web/lib/repo/agentJobs.ts`
- **what's untested:** The Supabase live branch of `advanceJob` (atomic `eq("status", fromStatus)` precondition). The `agentJobStateMachine.test.ts` forces `tryDb→null`.
- **risk if it breaks:** Live-mode race condition: two concurrent advances both succeed → job in inconsistent state.
- **test to add:** Test with mocked Supabase client that `advanceJob` emits the `.eq("status", fromStatus)` clause and returns null when status doesn't match.

---

### [P2] `links` repo — payment link flow untested
- **path:** `apps/web/lib/repo/links.ts`
- **what's untested:** `createLink`, `payLink` (invoice creation at pay time), `deactivateLink`, on-chain publish path.
- **risk if it breaks:** Payment link creates invoice with wrong vendor wallet. Deactivated link still accepts payments.
- **test to add:** Test `createLink` stores correct vendor wallet from join. Test `deactivateLink` prevents subsequent `payLink`.

---

### [P2] `admin/disputes/actions.ts` — operator dispute decision untested
- **path:** `apps/web/app/admin/disputes/actions.ts`
- **what's untested:** `decideDisputeAction` — operator auth gate, reason-hash derivation, cashout-advance on SLASH_LP outcome.
- **risk if it breaks:** Non-operator decides dispute. Wrong reason hash → on-chain revert when mainnet ships.
- **test to add:** Test `requireOperator` gate. Test each `DisputeOutcome` maps to correct `REASON_HASHES` entry.

---

### [P2] `lp/disputes/actions.ts` — LP evidence submission untested
- **path:** `apps/web/app/lp/disputes/actions.ts`
- **what's untested:** `lpDefendAction` — LP ownership verification (cashout.lpId match), evidence hash computation.
- **risk if it breaks:** LP submits evidence on another LP's dispute → case file poisoned.
- **test to add:** Test `lpDefendAction` rejects when `cashout.lpId !== lp.lpId`. Test evidence hash is real keccak256.

---

### [P2] `vendor/team/actions.ts` — RBAC enforcement untested
- **path:** `apps/web/app/(wallet)/vendor/team/actions.ts`
- **what's untested:** `_assertCanManageTeam` (owner-has-no-self-row logic), `inviteTeammateAction` (Owner role rejection), `changeRoleAction` (can't demote Owner).
- **risk if it breaks:** Member/ReadOnly user invites teammates → privilege escalation. Second Owner created → ambiguous tenant ownership.
- **test to add:** Test Member role is rejected by `_assertCanManageTeam`. Test `inviteTeammateAction` rejects `role="Owner"`. Test owner (no self-row) is allowed.

---

### [P2] `fx/actions.ts` — FX quote/settle untested
- **path:** `apps/web/app/fx/actions.ts`
- **what's untested:** `quoteAction` (pair validation, amount validation), `settleQuoteAction` (vendor ownership check).
- **risk if it breaks:** Unsupported pair accepted → undefined rate. Settle without ownership → cross-tenant FX state mutation.
- **test to add:** Test unsupported pair throws. Test `settleQuoteAction` rejects when quote belongs to different vendor.

---

### [P3] `auditLogs` repo — append-only, no test
- **path:** `apps/web/lib/repo/auditLogs.ts`
- **what's untested:** `appendAudit` — the `serviceDb()` insert path.
- **risk if it breaks:** Audit trail silently drops entries → compliance gap.
- **test to add:** Test `appendAudit` calls `serviceDb().from("audit_logs").insert(...)` with correct shape.

---

### [P3] `counterpartyCache` / `kpiSnapshots` / `protocolLimits` / `lpReputation` — read-only repos untested
- **path:** Various `apps/web/lib/repo/*.ts`
- **what's untested:** All read functions. These are display-only with graceful fallbacks.
- **risk if it breaks:** Page shows stale/empty data. No money or auth impact.
- **test to add:** Smoke test that `fromRow` mapping doesn't throw on representative DB rows.

---

### [P3] `onboarding/actions.ts` — vendor setup untested
- **path:** `apps/web/app/onboarding/actions.ts`
- **what's untested:** Wallet address validation, display name persistence.
- **risk if it breaks:** Invalid wallet stored → downstream invoice/cashout failures.
- **test to add:** Test wallet regex rejects malformed addresses.

---

## Critical Cross-Cutting Finding: Zero Live-Branch Coverage

**Every dual-mode repo** uses the pattern:
```ts
const c = await tryDb();
if (!c) return mockXxx(...);
// ... Supabase queries ...
```

The single repo test (`disputesRepo.test.ts`) explicitly mocks `tryDb → null`:
```ts
vi.mock("@/lib/db", () => ({ tryDb: vi.fn(async () => null) }));
```

This means:
1. **No Supabase query is ever executed in tests** — column name typos, missing joins, wrong `.eq()` clauses, and RLS policy mismatches are all invisible until production.
2. **The `fromRow` mapping functions** (which handle PostgREST's numeric→string coercion, null handling, enum mapping) are never tested against realistic DB row shapes.
3. **Atomic preconditions** (`.eq("status", fromStatus)`) that prevent race conditions are only tested at the mock level where they're trivially correct.

**Recommendation:** Create a `test/helpers/mockSupabaseClient.ts` that returns a chainable mock matching Supabase's query builder API. Write integration-style tests that verify the correct query shape is emitted for each repo function's live branch.

---

## Priority Summary

| Priority | Count | Examples |
|----------|-------|---------|
| **P0** | 9 | retainerStreams withdraw, delegations, cashouts live, invoices, WebAuthn, auth/magic, admin/pause, createCashoutAction, createInvoiceAction |
| **P1** | 8 | lp repo, team repo, webhooks repo, fxQuotes, lpMembers, vendors, disputes API, LP actions |
| **P2** | 6 | agentJobs live branch, links, admin disputes, LP disputes, team actions, fx actions |
| **P3** | 4 | auditLogs, read-only repos, onboarding |

**Total untested code paths identified: 27 gaps across 19 repos, 24 action files, and 26 API routes.**
