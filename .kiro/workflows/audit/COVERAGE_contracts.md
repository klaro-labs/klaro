# Klaro Contract Test-Coverage Audit

**Auditor:** contract_coverage  
**Date:** 2026-05-31  
**Scope:** `packages/contracts/src/` (22 contracts) vs `packages/contracts/test/` (48 test files, ~520 tests)

---

## Executive Summary

| Category | Finding |
|----------|---------|
| **Echidna harnesses** | ❌ ALL STUBS — every invariant function reverts `EchidnaHarnessNotWired()` |
| **Halmos harnesses** | ❌ ALL STUBS — every `check_*` function reverts `HalmosHarnessNotWired()` |
| **setOperator(0) guard** | Only 2/17 contracts tested (RetainerStream, CounterpartyRegistry) — **15 untested** |
| **Pause guard tests** | 5/10 Pausable contracts have NO pause-guard test suite |
| **Fuzz tests** | Only 5 fuzz tests exist across 37 fund-moving `safeTransfer` call sites in 10 contracts |
| **WrongDisputeContext** | 0 tests across all 3 contracts that implement this guard |
| **CashoutOrderProcessor RELEASE_TO_CLAIMANT** | Untested resolveDispute path |
| **writeOffPendingSlash** | 0 tests for owner-only admin escape hatch |

**README claims "Coverage runs against Foundry, Echidna, and Halmos" — this is FALSE.** Echidna and Halmos provide zero coverage; they are placeholder stubs that revert on every call.

---

## (1) Echidna + Halmos: Confirmed STUBS

### [P0] Echidna invariant harnesses — STUBS that revert

- **path:** `test/echidna/Targets.sol:24-42`
- **what's untested:** ALL 3 invariants (`escrow_conservation`, `cashout_no_double_release`, `splitter_dust_conservation`) revert with `EchidnaHarnessNotWired()`
- **risk:** README + THREAT_MODEL §5 + §Audit-checklist claim Echidna coverage. Zero invariant properties are actually verified. Conservation properties for InvoiceEscrow, CashoutOrderProcessor, and FeeSplitter are unproven.
- **test to add:** Wire concrete harness bodies that deploy contracts, expose state-changing entry points, and assert the 3 invariants between calls. Run `echidna --config echidna.yaml` in CI.

### [P0] Halmos symbolic harnesses — STUBS that revert

- **path:** `test/halmos/Targets.sol:26-43`
- **what's untested:** ALL 4 symbolic checks (`check_accept_does_not_double_spend`, `check_receipt_is_deterministic`, `check_dispute_outcome_is_idempotent`, `check_refund_burns_nonce`) revert with `HalmosHarnessNotWired()`
- **risk:** THREAT_MODEL audit checklist claims "Halmos formal verification on InvoiceEscrow.settle, AuditReceipt.mint, DisputeManager.decide". Zero paths explored. Double-spend, receipt determinism, and idempotency are unverified.
- **test to add:** Wire symbolic bodies with `svm.createBytes32()` inputs, deploy target contracts symbolically, assert properties. Run `halmos --config halmos.toml` in CI.

---

## (2) Functions/Branches with No Test

### [P0] CashoutOrderProcessor.resolveDispute — RELEASE_TO_CLAIMANT path untested

- **path:** `src/CashoutOrderProcessor.sol:420-424`
- **what's untested:** The `decision == Outcome.RELEASE_TO_CLAIMANT` branch that pays vendor without slash. Only SLASH_LP and REFUND_TO_RESPONDENT paths are tested.
- **risk:** HIGH — this is a fund-moving path (USDC to vendor). If the branch has a bug (e.g. pays wrong party, wrong amount), it would go undetected until production.
- **test to add:** `test_resolveDispute_releaseToClaimant_paysVendor()` — open dispute, decide RELEASE_TO_CLAIMANT, resolve, assert vendor receives `usdcAmount`.

### [P0] WrongDisputeContext guard — 0 tests across 3 contracts

- **path:** `src/AgentEscrow.sol:350`, `src/CashoutOrderProcessor.sol:404`, `src/RetainerStream.sol:296`
- **what's untested:** Cross-context replay attack where a case decided in one escrow's namespace is used to resolve a different escrow's dispute. All 3 contracts have the guard; none test it.
- **risk:** CRITICAL — without this test, a regression removing the guard would allow an attacker to replay an agent-context decision against a cashout escrow (or vice versa), routing funds to the wrong party.
- **test to add:** For each contract: open a dispute with context A, decide it, then attempt `resolveDispute` on a different contract that expects context B. Assert `WrongDisputeContext` revert.

### [P1] setOperator(address(0)) ZeroOperatorAddress — 15/17 contracts untested

- **path:** All contracts listed below
- **what's untested:** The `if (next == address(0)) revert ZeroOperatorAddress()` guard
- **risk:** MEDIUM-HIGH — if the guard is accidentally removed, owner could brick all operator-gated functions (settle, slash, resolve, assign) permanently, stranding escrowed funds.
- **test to add:** For each contract: `vm.expectRevert(Contract.ZeroOperatorAddress.selector); contract.setOperator(address(0));`

**Untested contracts (15):**
1. `AgentEscrow.sol:446`
2. `AgentRegistry.sol:216`
3. `AuditReceipt.sol:123`
4. `CashoutOrderProcessor.sol:517`
5. `DisputeManager.sol:294` (uses `ZeroAddress`)
6. `FeeSplitter.sol:108`
7. `InvoiceEscrow.sol:468`
8. `LPRegistry.sol:173`
9. `LPStaking.sol:327`
10. `MultiChainRouter.sol:148`
11. `ProofRegistry.sol:110`
12. `ReputationManager.sol:114`
13. `RoutePolicyEngine.sol:110`
14. `StableFXAdapterRegistry.sol:104`
15. `VendorReputation.sol:96`

**Tested (2):** RetainerStream, CounterpartyRegistry

### [P1] CashoutOrderProcessor.writeOffPendingSlash — completely untested

- **path:** `src/CashoutOrderProcessor.sol:330-339`
- **what's untested:** Owner-only admin escape hatch that writes off a deferred slash. No test for happy path, no test for `NoPendingSlash` revert, no test for non-owner revert.
- **risk:** HIGH — this is an owner-only function that deletes a financial liability record. If it has a bug (e.g. doesn't actually delete, or can be called by non-owner), the audit trail is broken.
- **test to add:** `test_writeOffPendingSlash_happyPath()`, `test_writeOffPendingSlash_noPending_reverts()`, `test_writeOffPendingSlash_nonOwner_reverts()`

### [P1] Pause guard tests missing for 5 Pausable contracts

| Contract | Has pause/unpause | Has pause-guard test suite |
|----------|:-:|:-:|
| InvoiceEscrow | ✅ (10 `whenNotPaused` functions) | ❌ NO |
| LPStaking | ✅ (4 `whenNotPaused` functions) | ❌ NO |
| RefundProtocol | ✅ (1 `whenNotPaused` function) | ❌ NO |
| DisputeManager | ✅ (5 `whenNotPaused` functions) | ❌ NO |
| RetainerStream | ✅ | ✅ (partial, in main test) |

- **risk:** HIGH for InvoiceEscrow + LPStaking (hold significant USDC). If a `whenNotPaused` modifier is accidentally removed during refactoring, the emergency pause becomes ineffective for that function.
- **test to add:** Create `InvoiceEscrowPauseGuards.t.sol`, `LPStakingPauseGuards.t.sol`, `RefundProtocolPauseGuards.t.sol`, `DisputeManagerPauseGuards.t.sol` — each pauses the contract then asserts every `whenNotPaused` function reverts `EnforcedPause()`.

### [P1] AgentEscrow.resolveDispute — FeeReceiverUnset branch (payToAgent=true, feeReceiver=0)

- **path:** `src/AgentEscrow.sol:370-372`
- **what's untested:** The `FeeReceiverUnset` revert inside `resolveDispute` when `payToAgent=true` and `klaroFeeReceiver == address(0)`. The test in `AgentEscrowReverts.t.sol:297` tests this for `markCompleted` but NOT for `resolveDispute`.
- **risk:** MEDIUM — fee-stranding bug would trap `feeUsdc` in the contract with no recovery path.
- **test to add:** `test_ResolveDispute_PayToAgent_FeeReceiverZero_Reverts()`

### [P2] RetainerStream.resolveDispute — OutcomeNotApplicable branch

- **path:** `src/RetainerStream.sol:303`
- **what's untested:** The `else { revert OutcomeNotApplicable(...) }` branch for outcomes other than RELEASE_TO_CLAIMANT and REFUND_TO_RESPONDENT. DisputeManager now rejects these at `decide()` time, but the defense-in-depth guard in RetainerStream itself is untested.
- **risk:** LOW (defense-in-depth) — but if DisputeManager's gate is ever relaxed, this becomes the last line of defense.
- **test to add:** Mock a DisputeManager that returns SLASH_LP for a stream context, call `resolveDispute`, assert `OutcomeNotApplicable` revert.

### [P2] CashoutOrderProcessor.resolveDispute — OutcomeNotApplicable branch

- **path:** `src/CashoutOrderProcessor.sol:445`
- **what's untested:** The `else { revert OutcomeNotApplicable(...) }` fallthrough for outcomes not in {REFUND_TO_RESPONDENT, RELEASE_TO_CLAIMANT, SLASH_LP}.
- **risk:** LOW (defense-in-depth) — same reasoning as above.
- **test to add:** Mock DisputeManager returning PENALIZE_VENDOR for cashout context, assert revert.

### [P2] DisputeManager.setOperator(address(0)) — ZeroAddress guard untested

- **path:** `src/DisputeManager.sol:294`
- **what's untested:** `if (next == address(0)) revert ZeroAddress()` — the test file tests non-owner revert and happy path but NOT the zero-address guard.
- **risk:** MEDIUM — bricking DisputeManager's operator would strand ALL disputed funds across AgentEscrow + CashoutOrderProcessor + RetainerStream.
- **test to add:** `test_SetOperator_ZeroAddress_Reverts()` in `DisputeManagerReverts.t.sol`

### [P3] Admin setters (setFeeReceiver, setDisputes) — non-owner revert partially tested

- **path:** Various
- **what's untested:** `AgentEscrow.setFeeReceiver` non-owner revert is tested. `CashoutOrderProcessor.setDisputes` non-owner revert is NOT explicitly tested (only used in setup). `RetainerStream.setDisputes` non-owner revert is NOT tested.
- **risk:** LOW — OZ Ownable2Step provides the guard, but regression risk exists.
- **test to add:** Explicit non-owner revert tests for each `setDisputes` and `setFeeReceiver`.

---

## (3) Money-Flow Functions vs Fuzz/Invariant Tests

### Summary

| Metric | Count |
|--------|-------|
| Contracts with `safeTransfer`/`safeTransferFrom` | 10 |
| Total `safeTransfer` call sites | 37 |
| Fund-moving external functions | ~25 |
| Fuzz tests (total) | **5** |
| Invariant tests (Echidna/Halmos) | **0** (all stubs) |

### Fuzz tests that exist:
1. `RetainerStream.t.sol::testFuzz_VestedIsMonotone` — math property
2. `RetainerStream.t.sol::testFuzz_ConservationOnCancel` — conservation
3. `DisputeManager.t.sol::testFuzz_AnyValidOutcome_DecidesTerminally` — state machine (no funds)
4. `FeeSplitter.t.sol::testFuzz_ConservationInvariant` — conservation
5. `LPRegistry.t.sol::test_OnlyHashesStored_NoStringFuzz` — storage (no funds)

### [P0] Fund-moving contracts with ZERO fuzz tests:

| Contract | Fund-moving functions | Fuzz tests |
|----------|:---------------------:|:----------:|
| **InvoiceEscrow** | `acceptAndPay`, `settle`, `settleWithSplits`, `refund` | **0** |
| **CashoutOrderProcessor** | `requestAndLock`, `confirmReceived`, `resolveDispute`, `expireUnconfirmed`, `cancel` | **0** |
| **AgentEscrow** | `fundJob`, `markCompleted`, `resolveDispute`, `cancel` | **0** |
| **LPStaking** | `stake`, `addStake`, `withdrawStake`, `slash` | **0** |
| **AgentBudgetWallet** | `spend`, `withdraw` | **0** |
| **RefundProtocol** | `executeRefund` | **0** |
| **StableFXAdapterRegistry** | `executeSwap` | **0** |

- **risk:** CRITICAL for InvoiceEscrow (highest TVL), CashoutOrderProcessor, AgentEscrow. Without fuzz testing, edge cases in amount calculations, fee splits, and boundary conditions are unverified.
- **test to add:** At minimum, fuzz the conservation invariant for each: `deposit == sum(payouts) + remaining_in_contract` for all terminal states.

---

## (4) THREAT_MODEL Claims vs Tested Behavior

### [P0] THREAT_MODEL §5 (Re-entrancy) — claims "explicit re-entrancy hostile-token test deferred to Echidna 5M-run pre-mainnet"

- **Reality:** Echidna harness is a stub. The "deferred" test does not exist and cannot run.
- **Partial mitigation:** `MoneyFlowReentrancy.t.sol` exists with hostile-token tests for AgentEscrow, CashoutOrderProcessor, FeeSplitter, RetainerStream. But InvoiceEscrow's reentrancy test (`InvoiceEscrowReentrancy.t.sol`) and RefundProtocol's (`RefundProtocolReentrancy.t.sol`) exist as unit tests, not Echidna invariants.
- **Gap:** The THREAT_MODEL's claim of Echidna coverage is false. The unit-level reentrancy tests partially cover this, but the 5M-run invariant exploration does not exist.

### [P1] THREAT_MODEL §Audit-checklist — claims Echidna + Halmos + Slither + Mythril

- **Reality:** Only Foundry tests run. No evidence of Slither or Mythril integration in CI or config files. `echidna.yaml` and `halmos.toml` exist but target stub contracts.
- **Gap:** 4/4 claimed static/formal tools are either stubs or absent from the build pipeline.

### [P2] THREAT_MODEL §13 (Unauthorized operator action) — claims "every contract has test_*_NonOperator_Reverts"

- **Reality:** Most contracts DO have this test. However:
  - `CashoutOrderProcessor.writeOffPendingSlash` (owner-only) has no auth test
  - `RetainerStream.resolveDispute` operator-only guard is tested ✅
  - `DisputeManager.open` trusted-caller gate is tested ✅
- **Gap:** Minor — mostly accurate, but `writeOffPendingSlash` is a gap.

### [P2] THREAT_MODEL §4 (LP slashes) — claims "slashAmount bound to order value"

- **Reality:** `test_resolveDispute_slashExceedingOrder_reverts` exists ✅. Claim is verified.
- **Gap:** None for this specific claim.

---

## Priority Summary

| Priority | Count | Description |
|----------|:-----:|-------------|
| **P0** | 5 | Echidna stubs, Halmos stubs, CashoutOrderProcessor RELEASE_TO_CLAIMANT untested, WrongDisputeContext untested (3 contracts), zero fuzz on 7 fund-moving contracts |
| **P1** | 5 | setOperator(0) 15 contracts untested, writeOffPendingSlash untested, 5 Pausable contracts missing pause-guard suites, AgentEscrow resolveDispute FeeReceiverUnset branch, THREAT_MODEL audit-checklist claims false |
| **P2** | 4 | OutcomeNotApplicable defense-in-depth (2 contracts), DisputeManager setOperator(0), admin setter non-owner reverts |
| **P3** | 1 | setDisputes/setFeeReceiver non-owner edge cases |

---

## Recommendations (ordered by impact)

1. **Wire Echidna + Halmos or remove claims.** The README badge "Coverage runs against Foundry, Echidna, and Halmos" is materially false. Either implement the harness bodies or remove the claim and update THREAT_MODEL.
2. **Add fuzz tests for every fund-moving function.** At minimum: InvoiceEscrow, CashoutOrderProcessor, AgentEscrow, LPStaking. Target conservation invariants.
3. **Add WrongDisputeContext cross-context replay tests.** This is a critical security guard with zero test coverage.
4. **Add CashoutOrderProcessor RELEASE_TO_CLAIMANT test.** This is a live fund-moving path with no test.
5. **Batch-add setOperator(0) tests.** 15 contracts × 1 test each = 15 trivial tests that prevent a catastrophic regression.
6. **Add pause-guard test suites** for InvoiceEscrow, LPStaking, RefundProtocol, DisputeManager.
7. **Add writeOffPendingSlash tests** — owner-only financial write-off with zero coverage.
