# D10 — QA / Test-Coverage Audit

**Auditor:** d10_qa  
**Date:** 2026-05-31  
**Scope:** packages/contracts/test (46 files), apps/web/test (28 files), apps/daemon/test (2 files), CI config, vitest configs, foundry.toml

---

## Executive Summary

The Klaro test suite is structurally sound for the contracts layer (500+ Foundry tests, reentrancy guards, revert coverage, EIP-712 sig tests). The web layer has good architectural guards (noMockInProductionPaths, envDrift, TOCTOU race). However, **critical gaps exist in the daemon (only 2 tests for 12 workers), the new repo modules (team/webhooks have zero tests), RLS enforcement (no integration test), and formal verification (Echidna + Halmos harnesses are stubs that revert)**. The fuzz surface is minimal (4 fuzz tests across 46 files). Several web tests assert on mock behavior rather than real DB/chain behavior, which masks live-mode bugs.

**Counts:**
- CRITICAL: 4
- HIGH: 7
- MEDIUM: 6
- LOW: 3
- INFO: 2

---

## Findings

### [CRITICAL] Echidna invariant harnesses are stubs — zero invariant coverage

- file: packages/contracts/test/echidna/Targets.sol:30-42
- lens: qa
- what: All three Echidna invariant functions (`echidna_invariant_escrow_conservation`, `echidna_invariant_cashout_no_double_release`, `echidna_invariant_splitter_dust_conservation`) unconditionally `revert EchidnaHarnessNotWired()`. No invariant is actually checked.
- why: The README and THREAT_MODEL claim "Coverage runs against Foundry, Echidna, and Halmos." This is false — Echidna provides zero coverage. An attacker exploiting a conservation violation (double-spend, double-release) would not be caught by any automated tool.
- fix: Wire concrete harness bodies that deploy contracts, seed state, and assert the three invariants. Add `echidna.yaml` config and a CI job that runs Echidna on every PR.
- confidence: 100% — the file explicitly reverts with `EchidnaHarnessNotWired`.

---

### [CRITICAL] Halmos symbolic harnesses are stubs — zero formal verification

- file: packages/contracts/test/halmos/Targets.sol:30-48
- lens: qa
- what: All four Halmos `check_*` functions (`check_accept_does_not_double_spend`, `check_receipt_is_deterministic`, `check_dispute_outcome_is_idempotent`, `check_refund_burns_nonce`) unconditionally `revert HalmosHarnessNotWired()`.
- why: Same overclaiming issue as Echidna. The money-flow chokepoints (acceptAndPay, refund, dispute decide) have no symbolic verification despite the README claiming Halmos coverage.
- fix: Implement symbolic harnesses with concrete contract deployments and symbolic inputs. Add `halmos.toml` and CI integration.
- confidence: 100% — the file explicitly reverts.

---

### [CRITICAL] Daemon has 2 tests for 12 workers — screenAndSettle, webhookDelivery, notifications, adminRisk, receiptGenerate, proofVerifier, cashoutAdvancer all untested

- file: apps/daemon/test/ (only releaseClaimBounded.test.ts, claimOnceAndReleaseLegacy.test.ts)
- lens: qa
- what: The daemon runs 12 BullMQ workers + an Arc event listener that collectively move real USDC (settle escrow, advance cashouts, mint receipts, deliver webhooks, slash LPs). Only the Redis idempotency primitives (`claimOnce`, `releaseClaimBounded`) have unit tests. Zero tests exist for:
  - `screenAndSettle.ts` — the worker that calls `escrow.settle()` on-chain
  - `cashoutAdvancer.ts` — the worker that calls `claimByLP`, `recordProof`, `operatorConfirmReceived`
  - `webhookDelivery.ts` — delivers signed payloads to vendor endpoints
  - `receiptGenerate.ts` — mints AuditReceipt NFTs
  - `notifications.ts` — sends emails via Resend
  - `proofVerifier.ts` — verifies LP payout proofs
  - `adminRisk.ts` — risk-hold logic
  - `arcSubscriber.ts` — the event listener that routes all on-chain events
- why: A bug in any of these workers silently loses or misdirects funds. The CI job for daemon (`pnpm test`) passes vacuously because only Redis tests run.
- fix: Add unit tests for each worker's core logic (state-machine transitions, error handling, retry semantics). Mock the chain client and DB, test the decision logic. Priority: cashoutAdvancer > screenAndSettle > receiptGenerate.
- confidence: 100% — grep for worker names in test files returns zero matches.

---

### [CRITICAL] Team repo (lib/repo/team.ts) has zero tests — invite/role/remove paths untested

- file: apps/web/lib/repo/team.ts:1-90
- lens: qa
- what: The team repository (listTeam, inviteTeammate, changeRole, removeTeammate) has no test file. These functions control multi-user access to vendor accounts. The RLS write policies were only added in migration 0036 (today), meaning the live path was silently failing until now — and there's still no test to verify it works.
- why: An attacker who can invite themselves to a vendor team gains full access to that vendor's invoices, cashouts, and wallet operations. No test validates the RLS scoping or the role-change authorization.
- fix: Create `apps/web/test/teamRepo.test.ts` covering: invite round-trip, role change, remove, cross-vendor isolation (vendor A cannot list vendor B's team), and the Owner-only guard on role escalation.
- confidence: 100% — grep for "team" in test files returns zero relevant matches.

---

### [HIGH] Webhooks repo (lib/repo/webhooks.ts) has zero tests — signing secret exposure, delivery recording untested

- file: apps/web/lib/repo/webhooks.ts:1-115
- lens: qa
- what: The webhooks repository (createWebhook, listWebhooks, getWebhook, recordDelivery) has no dedicated test. The `webhookVerify.test.ts` and `webhookReceiver.test.ts` test the HMAC verification and receiver logic, but NOT the repo's create/list/get paths or the RPC-based secret generation.
- why: The `createWebhook` function calls a Supabase RPC (`webhook_create`) that generates an encrypted signing secret. If this RPC fails silently or returns the wrong shape, vendors get broken webhook integrations with no test catching it.
- fix: Create `apps/web/test/webhooksRepo.test.ts` testing the mock-mode round-trip (create → list → get → recordDelivery) and verifying the signing secret is returned only at creation time.
- confidence: 100% — grep confirms no test imports from the webhooks repo.

---

### [HIGH] No RLS integration tests — 37 tables with RLS but zero tests verify cross-tenant isolation

- file: apps/web/supabase/migrations/0013_rls_cross_tenant_fix.sql:1-50
- lens: qa
- what: The project has 37 tables with RLS enabled and 36 migrations defining policies. There is no integration test that connects as two different vendor sessions and verifies that vendor A cannot read/write vendor B's data. The only RLS-related test is a comment in `safeFetchUrl.test.ts`.
- why: Migration 0013 documents that THREE P0 cross-tenant leaks shipped to production before being caught by manual audit. Without automated RLS tests, future migrations can silently re-introduce cross-tenant leaks. The new 0036 migration adds write policies but has no test proving they work.
- fix: Create an RLS integration test suite (can use Supabase local with `supabase start`) that: (1) creates two vendor sessions, (2) inserts data as vendor A, (3) asserts vendor B cannot SELECT/UPDATE/DELETE it, (4) covers the critical tables: invoices, cashouts, disputes, vendor_team_members, webhooks, audit_logs.
- confidence: 95% — no test file references RLS or cross-tenant verification.

---

### [HIGH] disputeDecide.test.ts asserts on mockDecideDispute, not the real repo — mock-on-real-path

- file: apps/web/test/disputeDecide.test.ts:1-35
- lens: qa
- what: The test imports `mockDecideDispute` directly from `mockData` and tests the mock's double-decide guard. It does NOT test the actual `disputes.ts` repo's `decide()` function against a real or simulated DB. The mock's guard is a simple `if (status === 'DECIDED') throw` — it doesn't validate RLS, the DB constraint, or the actual UPDATE query.
- why: The mock could pass while the real repo silently allows double-decide (e.g., if the UPDATE WHERE clause is wrong). The `disputesRepo.test.ts` does test the repo in mock-mode, which is better, but still doesn't test the live Supabase path.
- fix: Merge the `disputeDecide.test.ts` assertions into `disputesRepo.test.ts` (which already covers the repo layer). Add a note that live-mode coverage requires the RLS integration suite.
- confidence: 90% — the test explicitly imports from mockData, not from lib/repo/disputes.

---

### [HIGH] cashoutToctouRace.test.ts tests mock atomicity, not real DB atomicity

- file: apps/web/test/cashoutToctouRace.test.ts:1-85
- lens: qa
- what: The TOCTOU race test imports `mockAdvanceCashout` directly and tests the in-memory mock's `requireFromStatus` guard. The real Supabase path uses `UPDATE ... WHERE status = $1 RETURNING *` — the test doesn't verify this SQL actually works under concurrent access.
- why: The mock uses a simple `if (current.status !== expected) return null` which is NOT equivalent to a database-level atomic compare-and-swap. A real race condition could still exist if the Supabase query is malformed.
- fix: Add a comment acknowledging this is a mock-level test. For true TOCTOU coverage, add a concurrent integration test (two parallel requests to the same cashout) in the E2E suite or a pgTAP test.
- confidence: 85% — the mock's semantics approximate but don't guarantee DB atomicity.

---

### [HIGH] Only 4 fuzz tests across 46 contract test files — critical money-flow functions lack fuzz coverage

- file: packages/contracts/test/ (global)
- lens: qa
- what: Only 4 `testFuzz_*` functions exist: `testFuzz_VestedIsMonotone` (RetainerStream), `testFuzz_ConservationOnCancel` (RetainerStream), `testFuzz_AnyValidOutcome_DecidesTerminally` (DisputeManager), `testFuzz_ConservationInvariant` (FeeSplitter). The foundry.toml CI profile sets `fuzz.runs = 1000` but this only applies to these 4 tests.
- why: Critical money-flow functions lack fuzz coverage: `InvoiceEscrow.acceptAndPay` (amount boundaries, overflow), `CashoutOrderProcessor.release` (amount vs stake), `LPStaking.slash` (slash > stake), `RefundProtocol.executeRefund` (partial refund amounts), `MultiChainRouter.route` (fee calculation). These are the exact functions where edge-case amounts could cause loss.
- fix: Add fuzz tests for: (1) InvoiceEscrow — fuzz amount, dueAt, splits bps; (2) CashoutOrderProcessor — fuzz USDC/INR amounts, quote expiry; (3) LPStaking — fuzz slash amount vs current stake; (4) RefundProtocol — fuzz partial refund amounts.
- confidence: 100% — grep confirms only 4 testFuzz_ functions.

---

### [HIGH] No invariant tests in Foundry — CI profile configures invariant runs but no tests use them

- file: packages/contracts/foundry.toml:25 (`invariant = { runs = 256, depth = 32 }`)
- lens: qa
- what: The CI profile configures `invariant.runs = 256, depth = 32` but grep for `invariant_` in test files returns zero matches. The `--no-match-contract Invariant` flag in CI explicitly SKIPS any invariant contract. Combined with the stub Echidna targets, there is zero stateful invariant testing.
- why: Invariant tests are the primary defense against state-machine violations that unit tests miss (e.g., an invoice that transitions SETTLED → PAID, or a cashout that releases twice across different code paths).
- fix: Create `InvoiceEscrowInvariant.t.sol` and `CashoutOrderProcessorInvariant.t.sol` with handler contracts that exercise all state transitions and assert conservation invariants. Remove the `--no-match-contract Invariant` exclusion from CI once harnesses are wired.
- confidence: 100% — grep confirms zero invariant_ functions; CI explicitly excludes them.

---

### [HIGH] arcSubscriber event listener (34KB, 800+ lines) has zero tests — the single point of failure for all on-chain event routing

- file: apps/daemon/src/listener/arcSubscriber.ts:1-800+
- lens: qa
- what: The Arc event subscriber is the daemon's core — it receives ALL on-chain events (InvoiceSettled, OrderClaimed, ProofSubmitted, DisputeDecided, etc.) and routes them to the correct BullMQ queue. At 34KB it's the largest file in the daemon. It has zero test coverage.
- why: A routing bug here means events get dropped or sent to the wrong worker. For example, if a `DisputeDecided` event is misrouted, the LP slash never fires and the vendor never gets their funds back.
- fix: Extract the event-routing logic into a pure function (event → queue name + payload) and unit test every event type. Mock the viem subscription and verify correct queue dispatch.
- confidence: 100% — no test file references arcSubscriber.

---

### [MEDIUM] CI does not run Echidna or Halmos — formal verification is documentation-only

- file: .github/workflows/ci.yml:1-110
- lens: qa
- what: The CI workflow runs `forge test`, web typecheck+test, daemon typecheck+test, and a drift check. There is no job for Echidna or Halmos. Even if the harnesses were wired, they would never run in CI.
- why: Without CI enforcement, formal verification regresses silently. A developer could break an invariant and the PR would still merge green.
- fix: Add CI jobs for Echidna and Halmos (can be `continue-on-error: true` initially while harnesses are being wired, then promoted to hard-fail).
- confidence: 100% — the CI YAML has no mention of echidna or halmos.

---

### [MEDIUM] agentJobStateMachine.test.ts mocks auth + env + db — tests the state machine in isolation from real authorization

- file: apps/web/test/agentJobStateMachine.test.ts:20-40
- lens: qa
- what: The test mocks `requireVendor`, `supabaseLive`, and `tryDb` to force simulator mode. This means the test validates the in-memory state-machine transitions but NOT: (1) whether a non-owner vendor can advance another vendor's job, (2) whether the on-chain AgentEscrow state matches, (3) whether RLS prevents cross-tenant job access.
- why: The state machine guard is correct in isolation, but the authorization layer around it (which vendor can call which job) is untested. A cross-tenant job manipulation would not be caught.
- fix: Add a test case that attempts to advance a job belonging to vendor B while authenticated as vendor A. This requires either a live-mode test or a mock that preserves vendor identity scoping.
- confidence: 80% — the mocks explicitly bypass all auth checks.

---

### [MEDIUM] Flaky pattern: webhookVerify.test.ts uses `Date.now()` for replay window — time-sensitive assertions

- file: apps/web/test/webhookVerify.test.ts:25-35
- lens: qa
- what: The test generates timestamps with `Math.floor(Date.now() / 1000)` and asserts replay-window behavior based on a 5-minute window. If the test runner is slow (CI under load), the timestamp could age past the window between generation and verification.
- why: This is a classic flaky test pattern. Under normal conditions it passes, but under CI load or clock skew it could fail non-deterministically.
- fix: Use `vi.useFakeTimers()` to control time deterministically. Set a fixed timestamp, generate the signature, then advance time to test the replay window boundary.
- confidence: 70% — the window is 5 minutes so flakiness is unlikely but possible under extreme CI load.

---

### [MEDIUM] No test for the `settle()` → `recordScreening()` prerequisite enforcement in the web layer

- file: apps/web/lib/repo/invoices.ts (settle path)
- lens: qa
- what: The on-chain `InvoiceEscrow.settle()` requires `recordScreening()` to have been called first (tested in `InvoiceEscrow.t.sol:test_settle_revertsWhenScreeningNotRecorded`). However, the web layer's settle action (which calls the daemon's screenAndSettle worker) has no test verifying that the screening-first invariant is maintained in the application layer.
- why: If the web action or daemon worker skips the screening step (e.g., due to a race condition or code change), the on-chain call will revert, but the DB state may have already advanced to "settling" — creating a stuck invoice.
- fix: Add a web-layer test that attempts to settle an invoice without screening and verifies the action rejects it before reaching the chain.
- confidence: 75% — the contract enforces it, but the app layer could get into an inconsistent state.

---

### [MEDIUM] RetainerStream has fuzz tests but no adversarial cancel-after-full-vest scenario

- file: packages/contracts/test/RetainerStream.t.sol:230
- lens: qa
- what: `testFuzz_ConservationOnCancel` fuzzes the cancel timing but bounds `ct` (cancel time) to be between start and end. It doesn't test: (1) cancel at exactly `endTime` (boundary), (2) cancel after full vesting (should be no-op or revert), (3) cancel by non-owner.
- why: A cancel-after-full-vest bug could allow the payer to reclaim already-vested funds.
- fix: Add explicit boundary tests: cancel at t=endTime, cancel at t=endTime+1, cancel when already cancelled, cancel by non-owner.
- confidence: 75% — the fuzz bounds exclude the exact boundary.

---

### [MEDIUM] MultiChainRouter tests don't cover fee calculation edge cases or failed bridge scenarios

- file: packages/contracts/test/MultiChainRouter.t.sol:1-100, MultiChainRouterBridge.t.sol:1-60
- lens: qa
- what: The MultiChainRouter tests cover happy-path routing and basic bridge initiation. Missing: (1) fee calculation with zero amount, (2) fee calculation overflow with max uint256, (3) bridge failure/revert handling, (4) route to unsupported chain, (5) CCTP message attestation timeout.
- why: Cross-chain routing is a high-value attack surface. A fee calculation bug could allow free bridging or drain the router's balance.
- fix: Add negative tests: route with amount=0, route with amount=type(uint256).max, route to chainId=0, route when bridge contract is paused.
- confidence: 70% — the existing tests are limited to 2 files with basic scenarios.

---

### [LOW] Deploy.t.sol verifies wiring but doesn't test upgrade/migration paths

- file: packages/contracts/test/Deploy.t.sol:1-100
- lens: qa
- what: The deploy test verifies that the deployment script wires contracts correctly (operator addresses, staking slasher, etc.). It doesn't test: (1) what happens if a contract is upgraded, (2) storage layout compatibility, (3) ownership transfer to multisig.
- why: The roadmap mentions "Multisig ownership handover" for mainnet. Without upgrade tests, the handover could break contract wiring.
- fix: Add a test that simulates the ownership transfer sequence and verifies all operator/owner functions still work post-transfer.
- confidence: 60% — this is a mainnet concern, not testnet-blocking.

---

### [LOW] No test for the `simulatePaymentGuard` in live mode — only tests the guard's file-scanning logic

- file: apps/web/test/simulatePaymentGuard.test.ts:1-50
- lens: qa
- what: The test verifies that the `simulatePayment` function is not called from production paths by scanning source files. It doesn't test what happens if `simulatePayment` is accidentally invoked in live mode (should it throw? return early? log?).
- why: The guard is a static analysis check, not a runtime guard. If the static check is bypassed (e.g., dynamic import), there's no runtime safety net.
- fix: Add a runtime test that calls `simulatePayment` with `supabaseLive() === true` and verifies it throws or no-ops.
- confidence: 60% — the static guard is effective but not defense-in-depth.

---

### [LOW] Test-to-requirement traceability gap — no mapping from THREAT_MODEL threats to test files

- file: packages/contracts/THREAT_MODEL.md, THREAT_MODEL.md (root)
- lens: qa
- what: The threat models enumerate specific threats (T1-T20+) with mitigations, but there's no traceability matrix mapping each threat to the test(s) that verify the mitigation. A developer adding a new threat has no way to verify it's tested without manually searching.
- fix: Add a `THREAT_TEST_MAP.md` or comments in each test file referencing the threat ID it covers (e.g., `/// @notice Covers THREAT_MODEL T3: double-spend via replay`).
- confidence: 90% — no such mapping exists in any file.

---

### [INFO] foundry.toml `deny = ["warnings"]` is commented out — compiler warnings not enforced

- file: packages/contracts/foundry.toml:17
- lens: qa
- what: The comment says "uncomment at M11 audit gate" but the project is past M11 (audit prep). Compiler warnings could mask deprecation issues or unsafe patterns.
- fix: Uncomment `deny = ["warnings"]` now that the project is in audit phase.
- confidence: 100% — the line is explicitly commented.

---

### [INFO] CI `--no-match-contract Invariant` flag will silently skip any future invariant tests

- file: .github/workflows/ci.yml:28 (`forge test --no-match-contract Invariant -q`)
- lens: qa
- what: The CI forge test command excludes any contract matching "Invariant". This was added because the Echidna/Halmos stubs revert, but it means that if someone adds a real `InvoiceEscrowInvariant.t.sol`, it will be silently skipped in CI.
- fix: Remove the exclusion once invariant harnesses are wired. Or rename the stub contracts to not match the pattern (e.g., `EchidnaTargets` instead of `EchidnaInvariant`).
- confidence: 100% — the flag is in the CI YAML.

---

## Summary Table

| Severity | Count | Key Theme |
|----------|-------|-----------|
| CRITICAL | 4 | Formal verification stubs, daemon untested, team repo untested |
| HIGH | 7 | No RLS tests, mock-on-real-path, no fuzz/invariant coverage, arcSubscriber untested |
| MEDIUM | 6 | Auth bypass in mocks, flaky time patterns, missing boundary tests |
| LOW | 3 | Upgrade paths, runtime guards, traceability |
| INFO | 2 | Config hygiene |

## Recommendations (Priority Order)

1. **Wire Echidna + Halmos harnesses** or remove the claims from README/THREAT_MODEL. The current state is overclaiming.
2. **Add daemon worker tests** — at minimum for cashoutAdvancer and screenAndSettle (the money-moving paths).
3. **Create RLS integration test suite** — the project has had 3 P0 cross-tenant leaks already.
4. **Add team + webhooks repo tests** — these are new code with zero coverage.
5. **Add fuzz tests for InvoiceEscrow and CashoutOrderProcessor** — the money-flow chokepoints.
6. **Extract arcSubscriber routing logic** into a testable pure function.
7. **Add Foundry invariant tests** and remove the CI exclusion flag.
