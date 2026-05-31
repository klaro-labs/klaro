# D2 — Contracts Engineering Audit (Correctness + Quality)

**Auditor:** d2_contracts_eng  
**Date:** 2026-05-31  
**Scope:** `packages/contracts/src/*.sol` (22 contracts + 2 adapters + 1 library)  
**Lens:** Logic bugs, state-machine correctness, event emission gaps, spec/threat-model adherence, NatSpec gaps, dead code, gas inefficiency, upgradeability risks, TODO/FIXME, test coverage gaps.

---

## Summary

The codebase is well-structured with clear state machines, comprehensive error handling, and thorough inline documentation of past audit fixes. The threat model is well-maintained and accurately reflects the code. Most critical paths (reentrancy, replay, fee-stranding) have been addressed in prior iterations.

**Findings:** 3 MEDIUM, 5 LOW, 7 INFO

The most impactful finding is the `AgentEscrow.createJob` hook call ordering — the `beforeAction` hook fires BEFORE the `JobCreated` event, meaning a reverting hook on `createJob` (unlike all other actions where hooks are wrapped in try/catch) will silently prevent job creation with no event trail. The remaining findings are correctness edge cases, documentation gaps, and minor gas inefficiencies.

---

## Findings

### [MEDIUM] AgentEscrow.createJob hook is NOT wrapped in try/catch — inconsistent with all other actions
- file: packages/contracts/src/AgentEscrow.sol:155-157
- lens: contracts-eng
- what: `createJob` calls `h.beforeAction(...)` and `h.afterAction(...)` directly (lines 155, 157), while every other lifecycle function (`fundJob`, `startJob`, `submitDeliverable`, `markCompleted`, `openDispute`, `cancel`) uses the `_safeBefore`/`_safeAfter` wrappers that catch reverts and emit `HookReverted`. A malicious or buggy hook supplied by the principal at create-time will revert the entire `createJob` transaction.
- why: The NatSpec on `_safeBefore`/`_safeAfter` (lines 268-280) explicitly states the rationale: "a principal-supplied malicious or buggy hook can't permanently block agent-side transitions". But `createJob` is the PRINCIPAL's own call, so a reverting hook only blocks the principal themselves — not the agent. However, this creates an inconsistency: if the principal supplies a hook that conditionally reverts (e.g., based on `agentId`), the `createJob` will fail with an opaque revert from the hook rather than the clear `HookReverted` event. More critically, if the hook is a proxy that gets upgraded between `createJob` and `fundJob`, the behavior divergence is confusing.
- fix: Wrap the hook calls in `createJob` with the same `_safeBefore`/`_safeAfter` pattern for consistency. If the design intent is that `createJob` SHOULD revert on hook failure (since it's the principal's own call and no funds are at risk), document this explicitly in NatSpec.
- confidence: medium (correctness inconsistency, not a fund-loss vector)

### [MEDIUM] AgentEscrow.openDispute has redundant DisputeManager null check after early revert
- file: packages/contracts/src/AgentEscrow.sol:199-208
- lens: contracts-eng
- what: Line 199 checks `if (address(disputes) == address(0)) revert DisputesNotConfigured();` — this is correct and prevents the stranded-funds bug documented in the comment. However, line 205 then checks `if (address(disputes) != address(0))` before calling `disputes.open(...)`. This second check is dead code — if `disputes` were `address(0)`, execution would have already reverted at line 199. The `if` guard makes it look like the `disputes.open()` call is optional, which contradicts the fix's intent.
- why: The dead conditional suggests the code was patched incrementally (the early revert was added but the old conditional wasn't removed). A future maintainer might read the `if` and incorrectly conclude that opening a case in DisputeManager is optional, potentially removing the early revert.
- fix: Remove the `if (address(disputes) != address(0))` wrapper at line 205 and call `disputes.open(...)` unconditionally (since the early revert guarantees it's non-zero).
- confidence: high (dead code, no runtime impact)

### [MEDIUM] CashoutOrderProcessor.resolveDispute — REFUND_TO_RESPONDENT pays LP, naming is confusing and potentially incorrect
- file: packages/contracts/src/CashoutOrderProcessor.sol:230-235
- lens: contracts-eng
- what: When `decision == Outcome.REFUND_TO_RESPONDENT`, the code pays `lpAddr` (the LP wallet). In the cashout dispute context, the vendor is always the claimant (they open the dispute via `openDispute`), and the LP wallet is always the respondent. So `REFUND_TO_RESPONDENT` = "pay the respondent" = "pay the LP" — this is semantically correct but confusing: the outcome name says "REFUND" but the LP is receiving the escrowed USDC as their rightful payout (the vendor's dispute was rejected). The `Status` is set to `RESOLVED_LP_PAYS` which reads as "LP pays" but actually means "resolved, LP gets paid". This naming inversion could cause operator confusion.
- why: The DisputeManager's `REFUND_TO_RESPONDENT` outcome is generic across all contexts. In the cashout context, "refund to respondent" means "the LP (respondent) was right, release their USDC". The status enum `RESOLVED_LP_PAYS` is ambiguous — does it mean "LP pays the vendor" or "LP gets paid"? Reading the code, it means the latter, but the name suggests the former.
- fix: Rename `RESOLVED_LP_PAYS` to `RESOLVED_LP_WINS` or `RESOLVED_LP_RECEIVES` for clarity. Add NatSpec on the enum values explaining the semantics.
- confidence: medium (naming confusion, no logic bug — the fund flow is correct)

### [LOW] InvoiceEscrow.acceptAndPay skips ACCEPTED state — event ordering implies two transitions but storage only writes PAID
- file: packages/contracts/src/InvoiceEscrow.sol:175-180
- lens: contracts-eng
- what: The function sets `inv.status = Status.PAID` (line 177) and emits both `InvoiceAccepted` and `InvoicePaid` events. The comment says "moves through ACCEPTED logically; emit both events." However, the `Status.ACCEPTED` enum value (2) is never written to storage in any code path. This means `statusOf(invoiceId)` will never return `ACCEPTED` for any invoice — the enum value is dead.
- why: If any off-chain indexer or consumer contract checks for `Status.ACCEPTED` as a valid intermediate state, it will never match. The state machine documented in the NatSpec (`CREATED → ACCEPTED → PAID → SETTLED`) doesn't match reality (`CREATED → PAID → SETTLED`). This is a spec/implementation mismatch.
- fix: Either (a) remove `ACCEPTED` from the enum and update the NatSpec state machine, or (b) if a future flow needs a two-step accept-then-pay (e.g., accept now, pay later), keep it but document that the current `acceptAndPay` is an atomic shortcut that skips it.
- confidence: high (dead enum value, spec mismatch)

### [LOW] RetainerStream.resolveDispute refunds unvested but doesn't account for already-withdrawn amounts in the payer-wins path
- file: packages/contracts/src/RetainerStream.sol:237-241
- lens: contracts-eng
- what: When `payerWon == true`, the code computes `refund = s.deposit - vestedNow` and transfers that to the payer. This is correct for the conservation invariant (deposit = vested + unvested; payer gets unvested back). However, the `vestedNow` includes amounts already withdrawn by the recipient. The recipient keeps what they already withdrew, and the remaining vested-but-unwithdrawn stays claimable. This is the intended behavior per the conservation invariant, but there's no event or storage field that records how much the recipient already withdrew at dispute-resolution time — making off-chain reconciliation harder.
- why: An off-chain auditor seeing `DisputeResolved(streamId, outcome, payerWon=true, refundToPayer=X)` cannot determine from on-chain data alone how much the recipient already drained vs. how much remains claimable. The `accountingFor` view helps, but the event itself is incomplete.
- fix: Add `uint256 recipientAlreadyWithdrawn` to the `DisputeResolved` event for audit completeness.
- confidence: medium (no fund loss, audit-trail gap)

### [LOW] AuditReceipt.mint — receiptOf mapping collision when receiptHash == bytes32(0)
- file: packages/contracts/src/AuditReceipt.sol:72
- lens: contracts-eng
- what: The `AlreadyMinted` check uses `receiptOf[receiptHash] != 0`. But `receiptOf` maps `bytes32 → uint256`, and the default value for unmapped keys is `0`. If `receiptHash` happens to equal `bytes32(0)` (which would require `keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx))` to be zero — astronomically unlikely but not impossible), then `tokenId = uint256(bytes32(0)) = 0`, and `receiptOf[bytes32(0)]` would be set to `0`, making the `!= 0` check always pass for that hash — allowing double-minting of tokenId 0.
- why: Practically impossible (keccak256 preimage for zero), but the pattern is fragile. A safer guard would check `anchors[tokenId].settledAt != 0` or use a separate `bool minted` mapping.
- fix: Add `require(receiptHash != bytes32(0), "zero hash")` as a defensive guard, or check `_ownerOf(tokenId) != address(0)` instead of `receiptOf[receiptHash] != 0`.
- confidence: low (theoretical only — keccak256 collision with zero is computationally infeasible)

### [LOW] MultiChainRouter has no Pausable — only contract in the money-adjacent stack without a kill switch
- file: packages/contracts/src/MultiChainRouter.sol:1-280
- lens: contracts-eng
- what: `MultiChainRouter` does not inherit `Pausable`. It doesn't hold funds, but `initiateBridge` emits `BridgeInitiated` which the daemon acts on to perform real CCTP burns. If the operator key is compromised, there's no way to freeze bridge-intent emissions without rotating the operator (which breaks all other operator-gated paths on this contract).
- why: The threat model (§12) discusses stale config but not operator-key compromise on the router specifically. Every other contract in the stack has `Pausable` for incident response. The router's `initiateBridge` is operator-only, so the blast radius is limited to a compromised operator — but that's exactly the scenario `Pausable` is designed for.
- fix: Add `Pausable` to `MultiChainRouter` with `whenNotPaused` on `initiateBridge` and `recordExecution`. Owner-only pause/unpause.
- confidence: high (design gap, consistent with the project's own "boring infra" principle)

### [LOW] VendorReputation._runningPerKind array is fixed at 12 but enum could grow
- file: packages/contracts/src/VendorReputation.sol:62
- lens: contracts-eng
- what: `_runningPerKind` is declared as `int256[12]` (fixed-size array). The `Kind` enum currently has 12 non-NONE values. If a new `Kind` is added (e.g., `STREAM_COMPLETED`), the `record()` function at line 148 computes `idx = uint8(kind)` and accesses `_runningPerKind[vendorId][idx - 1]`. For a 13th kind, `idx - 1 = 12` which is out of bounds for a `[12]` array — the transaction reverts.
- why: The `KIND_COUNT = 12` constant (line 175) documents this, but there's no compile-time or deploy-time guard that ensures the enum and array stay in sync. A future developer adding a new Kind without updating the array size will silently break `record()` for that kind.
- fix: Either use a `mapping(uint8 => int256)` instead of a fixed array, or add a compile-time assertion: `assert(uint8(type(Kind).max) <= KIND_COUNT)` in the constructor.
- confidence: high (latent bug, will manifest on enum extension)

### [INFO] AgentEscrow.createJob deploys a new NoopACPHook contract on every job with hook == address(0)
- file: packages/contracts/src/AgentEscrow.sol:143
- lens: contracts-eng
- what: `IACPHook h = address(hook) == address(0) ? IACPHook(address(new NoopACPHook())) : hook;` — this deploys a fresh contract for every job that doesn't specify a hook. On Arc testnet with sub-cent gas this is negligible, but on mainnet this is ~32k gas wasted per job for a contract that does nothing.
- why: Gas inefficiency. A singleton `NoopACPHook` deployed once and referenced by address would save the CREATE cost on every no-hook job.
- fix: Deploy a single `NoopACPHook` in the constructor (or as an immutable) and reference it instead of deploying a new one per job.
- confidence: high (clear gas waste, easy fix)

### [INFO] FeeSplitter.distributeAdHoc accepts `Split[] calldata` but InvoiceEscrow passes `Split[] memory`
- file: packages/contracts/src/FeeSplitter.sol:131 / packages/contracts/src/InvoiceEscrow.sol:228
- lens: contracts-eng
- what: `FeeSplitter.distributeAdHoc` signature takes `Split[] calldata items`. But `InvoiceEscrow.settle` calls it with `_readSplits(invoiceId)` which returns `Split[] memory`. Solidity 0.8.28 allows passing `memory` to an external function expecting `calldata` (it copies), but this means the splits are copied from storage → memory → calldata encoding → decoded in FeeSplitter. An alternative would be to pass the splits directly from storage or use the stored splitId path.
- fix: Consider adding a `distribute(token, amount, Split[] memory items)` overload or using the stored-split path for invoice settlements. Low priority — the gas overhead is small for typical split counts (2-5 payees).
- confidence: low (minor gas, no correctness issue)

### [INFO] No test coverage for RetainerStream dispute resolution paths
- file: packages/contracts/test/RetainerStream.t.sol (missing dispute tests)
- lens: contracts-eng
- what: The test file covers `createStream`, `withdraw`, `cancelStream`, and the conservation invariant fuzz. But `openDispute`, `resolveDispute` (payer-wins and recipient-wins paths), and the `DisputeAwaitingResolution` guard on `withdraw` have no dedicated test coverage. These are complex paths with fund movements.
- why: The `RetainerStream` dispute wiring (RS1) was added in a recent iteration. The threat model references tests for other contracts' dispute paths but not RetainerStream's.
- fix: Add tests for: (1) openDispute happy path, (2) resolveDispute payer-wins refunds unvested, (3) resolveDispute recipient-wins unblocks withdraw, (4) withdraw reverts with DisputeAwaitingResolution when case is DECIDED but not resolved, (5) openDispute reverts on cancelled stream, (6) resolveDispute reverts on cancelled stream.
- confidence: high (verified by reading test file listing — no dispute test file exists for RetainerStream)

### [INFO] No test file for CashoutOrderProcessor.retrySlash / writeOffPendingSlash
- file: packages/contracts/test/ (no retrySlash test)
- lens: contracts-eng
- what: `retrySlash` and `writeOffPendingSlash` are recent additions (deferred-slash pattern). The existing `CashoutOrderProcessor.t.sol` and `CashoutOrderProcessorReverts.t.sol` don't appear to cover the deferred-slash → retry → success path, nor the write-off path.
- why: These are operator-critical recovery paths. If `retrySlash` has a bug (e.g., the `delete pendingSlash[cashoutId]` before the external call creates a reentrancy window — though nonReentrant covers it), it would only surface in production when LPStaking is independently paused.
- fix: Add tests for: (1) resolveDispute with SLASH_LP when staking is paused → SlashDeferred event, (2) retrySlash succeeds after unpause, (3) retrySlash reverts NoPendingSlash when no record, (4) writeOffPendingSlash by owner, (5) writeOffPendingSlash reverts for non-owner.
- confidence: medium (would need to read full test files to confirm absence — based on file listing and dates)

### [INFO] KlaroConfig.KLARO_FEE_RECEIVER is address(0) — multiple contracts will revert on fee-bearing operations
- file: packages/contracts/src/KlaroConfig.sol:109
- lens: contracts-eng
- what: `KLARO_FEE_RECEIVER = address(0)` is intentional for testnet (fail-loud). But `LPStaking.feeReceiver` is initialized to this value in the constructor (line 178 of LPStaking.sol). Any `slash()` call will revert with `FeeReceiverUnset` until the owner calls `setFeeReceiver`. Similarly, `AgentEscrow.markCompleted` and `resolveDispute` revert `FeeReceiverUnset` if `klaroFeeReceiver == address(0)`. This is documented and intentional, but the deploy script must set these before any fee-bearing operation can succeed.
- why: Not a bug — it's the intended "fail-loud" behavior. But the deploy test (`Deploy.t.sol`) should verify that the fee receiver is set post-deploy for integration test suites to pass.
- fix: Ensure the deploy script (or `Deploy.t.sol`) calls `setFeeReceiver` on LPStaking and `setFeeReceiver` on AgentEscrow as part of the wiring sequence. Document in DEPLOYMENT.md.
- confidence: high (intentional design, operational concern)

### [INFO] InvoiceEscrow.cancelInvoice allows cancellation from ACCEPTED state but ACCEPTED is never reachable
- file: packages/contracts/src/InvoiceEscrow.sol:148-149
- lens: contracts-eng
- what: `cancelInvoice` checks `if (inv.status != Status.CREATED && inv.status != Status.ACCEPTED)` — allowing cancellation from both CREATED and ACCEPTED. But as noted in finding [LOW] above, `Status.ACCEPTED` is never written to storage (the only transition from CREATED goes directly to PAID via `acceptAndPay`). The ACCEPTED branch in `cancelInvoice` is dead code.
- why: If a future two-step flow (accept-then-pay-later) is added, this guard is forward-compatible. But today it's unreachable.
- fix: Document in NatSpec that the ACCEPTED guard is forward-compatible for a future split accept/pay flow. No code change needed.
- confidence: high (dead branch, no impact)

### [INFO] DisputeManager.decide allows SLASH_LP only for cashout context but PENALIZE_VENDOR is rejected for all contexts
- file: packages/contracts/src/DisputeManager.sol:195-200
- lens: contracts-eng
- what: The `decide` function's resolvability check (line 195) allows `RELEASE_TO_CLAIMANT`, `REFUND_TO_RESPONDENT`, and `SLASH_LP` (only for cashout context). `PENALIZE_VENDOR` and `MUTUAL_RESOLVED` are rejected for ALL escrow-backed contexts. This means the `PENALIZE_VENDOR` and `MUTUAL_RESOLVED` enum values can only be used for ad-hoc cases (context == 0) which have no escrow to enforce. They exist in the enum but have no on-chain enforcement path.
- why: These outcomes are documented in the enum but have no consumer. `VendorReputation` records `DISPUTE_LOST` events but doesn't read from DisputeManager outcomes. The enum values are forward-compatible placeholders.
- fix: Document in NatSpec that `PENALIZE_VENDOR` and `MUTUAL_RESOLVED` are reserved for future use (off-chain enforcement only today). Consider removing them from the enum if they'll never have on-chain enforcement to reduce the attack surface of operator mistakes.
- confidence: medium (design intent unclear — may be intentional forward-compat)

---

## Threat Model Adherence

All 13 vectors in `packages/contracts/THREAT_MODEL.md` are accurately reflected in the code:

| Vector | Status | Notes |
|--------|--------|-------|
| §1 Signature replay | ✅ Mitigated | invoiceId bound in digest, status check prevents double-accept |
| §2 Splits-hash rug | ✅ Mitigated | splitsHash in EIP-712, immutable post-create |
| §3 Fee splitter dust | ✅ Mitigated | BPS sum validated, last-payee absorbs dust |
| §4 LP slash bounds | ✅ Mitigated | lpId-bound, assertActive gate, snapshot wallet |
| §5 Re-entrancy | ✅ Mitigated | ReentrancyGuard on all fund-moving functions |
| §6 Dispute hijack | ✅ Mitigated | trustedCaller gate on namespaced contexts |
| §7 Self-rate | ✅ Mitigated | snapshot is now operator-only |
| §8 Stream over-withdraw | ✅ Mitigated | withdrawable clamped, cancel snapshot |
| §9 Agent fee manipulation | ✅ Mitigated | maxAgentFeeBps cap, hard cap at 5000 |
| §10 ACPHook DOS | ✅ Mitigated | try/catch wrappers (except createJob — see finding above) |
| §11 Budget wallet bypass | ✅ Mitigated | allowlist + daily cap + pause |
| §12 Stale config | ✅ Mitigated | KlaroConfig + CI drift check |
| §13 Unauthorized operator | ✅ Mitigated | ReasonCodes + audit log + per-contract operator-only |

---

## Test Coverage Assessment

| Contract | Test Files | Coverage Assessment |
|----------|-----------|-------------------|
| InvoiceEscrow | 4 files | Good — happy path, refund guard, reentrancy, createFor |
| AgentEscrow | 5 files | Good — lifecycle, reverts, pause, reentrancy, dispute resolution |
| CashoutOrderProcessor | 3 files | Good — but missing retrySlash/writeOff paths |
| DisputeManager | 3 files | Good — state machine, reverts, lifecycle |
| LPStaking | 2 files | Good — happy path + reverts |
| RetainerStream | 1 file | **Gap** — no dispute resolution tests |
| FeeSplitter | 1 file | Good — conservation fuzz + edge cases |
| MultiChainRouter | 2 files | Adequate — bridge + routing |
| RefundProtocol | 3 files | Good — happy path, reverts, reentrancy |
| AgentRegistry | 2 files | Good |
| AgentBudgetWallet | 1 file | Adequate |
| Others (config, proof, veil, counterparty, reputation) | 1 each | Adequate for their complexity |

---

## No TODO/FIXME Found

Grep of the source files shows no `TODO` or `FIXME` markers. All prior items have been resolved and documented inline with iteration references.
