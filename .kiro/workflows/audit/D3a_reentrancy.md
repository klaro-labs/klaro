# D3a — Reentrancy & External-Call Safety Audit

**Auditor lens:** Reentrancy (cross-function, cross-contract, read-only), checks-effects-interactions (CEI) ordering, unsafe external calls, ERC20 transfer/transferFrom return-value handling, reentrancy-guard coverage gaps, callback/hook exploitation, and state updated after external calls.

**Files reviewed (22 contracts + 2 library/interface + 1 adapter):**
InvoiceEscrow, AgentEscrow, CashoutOrderProcessor, LPStaking, RetainerStream, DisputeManager, FeeSplitter, MultiChainRouter, RefundProtocol, AgentBudgetWallet, StableFXAdapterRegistry, AgentRegistry, RoutePolicyEngine, LPRegistry, ProofRegistry, CounterpartyRegistry, PrivacyVeil, VendorReputation, ReputationManager, AuditReceipt, KlaroConfig, IACPHook/NoopACPHook, IStableFXAdapter, MockStableFXAdapter.

**Summary:** 3 findings (0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW, 0 INFO).

The codebase is well-defended against reentrancy. All ERC20 interactions use OpenZeppelin `SafeERC20` (handles return-value checking). All fund-moving functions carry `nonReentrant`. State transitions happen before external calls in the critical paths. The `AgentEscrow` hook calls are wrapped in try/catch to prevent griefing. The `AuditReceipt` uses `_safeMint` (ERC721 callback) but is operator-only so the callback target is the vendor — not attacker-controlled in practice.

---

## Findings

### [MEDIUM] AuditReceipt._safeMint callback to untrusted vendor address

- file: C:\Users\prate\Downloads\arcbuild\packages\contracts\src\AuditReceipt.sol:119
- lens: reentrancy/external-calls
- what: `_safeMint(a.vendor, tokenId)` invokes `onERC721Received` on the vendor address if it is a contract. The `mint` function has no `nonReentrant` guard. Although the `AlreadyMinted` check (line 113: `if (receiptOf[receiptHash] != 0) revert AlreadyMinted()`) and the internal OZ `_mint` ownership write happen before the callback, a malicious vendor contract receiving the callback could re-enter `mint` with a *different* anchor (different invoiceId) in the same transaction, potentially front-running the operator's intended mint ordering or causing unexpected event emission sequences.
- why: A malicious vendor contract could exploit the callback to re-enter `mint` with a different receipt hash before the first `mint` call completes its event emission. Impact is limited because each receiptHash can only be minted once and the function is operator-only, but the operator's single tx could be hijacked to mint additional receipts the operator didn't intend if the operator batches via multicall. More critically, if the vendor contract reverts in `onERC721Received`, the operator's mint permanently fails for that vendor — a griefing vector.
- fix: Add `ReentrancyGuard` to `AuditReceipt` and apply `nonReentrant` to `mint`. Alternatively, use `_mint` instead of `_safeMint` since the receipt is soulbound and the vendor never needs to "receive" it in the ERC721-receiver sense.
- confidence: med

### [MEDIUM] AgentEscrow.createJob — external hook call with principal-controlled hook before state is fully committed to events

- file: C:\Users\prate\Downloads\arcbuild\packages\contracts\src\AgentEscrow.sol:148-150
- lens: reentrancy/external-calls
- what: In `createJob`, the storage write (line 131-147) happens before the hook calls (line 148-150), which is correct for CEI. However, the `beforeAction` hook call on line 148 is NOT wrapped in the `_safeBefore` try/catch pattern used by all other lifecycle functions (fundJob, startJob, etc.). It is called directly: `h.beforeAction(ACTION_CREATE, jobId, msg.sender, agent, amountUsdc)`. If the principal-supplied hook reverts, the entire `createJob` reverts — this is intentional for `createJob` (principal controls their own hook). But the `afterAction` on line 150 is also called directly without try/catch. A malicious hook's `afterAction` could consume all gas or revert, preventing the `JobCreated` event from being emitted while the storage write has already landed (the event is between the two hook calls on line 149). Since `nonReentrant` is applied, re-entry is blocked, but the direct (non-try/catch) hook pattern in `createJob` is inconsistent with the rest of the contract.
- why: If the principal-supplied hook's `afterAction` reverts, the entire transaction reverts including the storage write — so no state inconsistency occurs. However, this is a design inconsistency: all other functions use `_safeBefore`/`_safeAfter` (try/catch) to prevent hook griefing, but `createJob` does not. A principal who deploys a hook that works on `createJob` but reverts on `afterAction` for all subsequent calls would not be caught by the try/catch wrappers in `createJob` specifically. The real risk is minimal since the principal controls their own hook and harms only themselves, but the inconsistency could mask bugs in future refactors.
- fix: Wrap the `createJob` hook calls in the same `_safeBefore`/`_safeAfter` pattern used by all other lifecycle functions, or document the intentional divergence. The current direct-call pattern means a reverting hook blocks job creation entirely (which may be desired as a screening gate), but should be explicitly documented.
- confidence: low

### [LOW] CashoutOrderProcessor._confirmReceivedTransitions — state update before external call is correct but event ordering is suboptimal

- file: C:\Users\prate\Downloads\arcbuild\packages\contracts\src\CashoutOrderProcessor.sol:175-180
- lens: reentrancy/external-calls
- what: In `_confirmReceivedTransitions`, the status is set to `RELEASED` (line 176) before the `safeTransfer` (line 179), which is correct CEI. However, `OrderConfirmed` is emitted (line 178) between the state write and the transfer, and `OrderReleased` is emitted after the transfer (line 180). If the USDC token were to have a transfer hook (ERC-777 style), the `OrderReleased` event would not yet be emitted during the callback. This is not exploitable because: (1) USDC on Arc is a standard ERC-20 without hooks, (2) `nonReentrant` is applied on both caller paths, (3) status is already RELEASED so re-entry would fail the status check.
- why: No practical exploit given USDC's implementation and the reentrancy guard. Noted for completeness — if the token were ever changed to one with transfer hooks, the event ordering could confuse off-chain indexers during the callback window.
- fix: No action required. The pattern is safe for USDC. If multi-token support is added in the future, ensure tokens with transfer hooks are evaluated.
- confidence: low

---

## Clean Contracts (no findings for this lens)

The following contracts are **clean** for the reentrancy/external-calls lens:

- **InvoiceEscrow** — All fund-moving functions have `nonReentrant`. CEI ordering is correct (status set before transfers in `settle`, `refund`). `SafeERC20` used throughout. The `acceptAndPay` function sets state before `safeTransferFrom`. External calls to `CounterpartyRegistry` and `PrivacyVeil` are view-only or storage-only with no callback risk.

- **LPStaking** — `nonReentrant` on all fund-moving functions (`register`, `addStake`, `withdrawStake`, `slash`). CEI correct. `SafeERC20` used. No callbacks.

- **CashoutOrderProcessor** — `nonReentrant` on all fund-moving paths. CEI correct (status updated before transfers). `retrySlash` correctly clears `pendingSlash` before the external `staking.slash()` call. `SafeERC20` used throughout.

- **RetainerStream** — `nonReentrant` on `createStream`, `cancelStream`, `withdraw`, `resolveDispute`, `openDispute`. CEI correct. `SafeERC20` used. State updated before transfers.

- **FeeSplitter** — `nonReentrant` on both `distribute` and `distributeAdHoc`. `SafeERC20` used. `onlyTrustedCaller` restricts access. Multiple `safeTransfer` calls in a loop are protected by the reentrancy guard.

- **AgentBudgetWallet** — `nonReentrant` on `fund`, `withdraw`, `spend`. `SafeERC20` used. State (`windowSpentUsdc`) updated before transfer in `spend`.

- **RefundProtocol** — `nonReentrant`. State (`refunded[invoiceId]`, nonce bump) set before the external `escrow.refund()` call. `SafeERC20` not directly used (delegates to escrow).

- **StableFXAdapterRegistry** — `nonReentrant` on `swap`. `SafeERC20` used for the `safeTransferFrom`. External adapter call happens after the pull, and the registry re-validates `dstAmount` after the adapter returns.

- **MockStableFXAdapter** — `onlyTrustedCaller` restricts `swap`. `SafeERC20` used. No reentrancy guard needed (single external call, no state mutation beyond the transfer).

- **DisputeManager** — No fund movement. Pure state-machine transitions. No external calls. No reentrancy risk.

- **AgentRegistry** — No fund movement. No external calls beyond `SignatureChecker` (library, not external call). No reentrancy risk.

- **MultiChainRouter** — No fund movement (routing oracle + audit log only). No token transfers. No reentrancy risk.

- **RoutePolicyEngine** — Pure view gate. No state mutation in `checkRoute`. No reentrancy risk.

- **LPRegistry** — No fund movement. Operator-only state writes. No external calls. No reentrancy risk.

- **ProofRegistry** — No fund movement. Operator-only writes. No external calls. No reentrancy risk.

- **CounterpartyRegistry** — No fund movement. Operator-only writes. No external calls. No reentrancy risk.

- **PrivacyVeil** — No fund movement. `onlyTrustedCaller` for commits. No external calls. No reentrancy risk.

- **VendorReputation** — No fund movement. `onlyAuthorized` writes. No external calls. No reentrancy risk.

- **ReputationManager** — No fund movement. External view call to `VendorReputation.vendorWeightsByKind` is read-only. No reentrancy risk.

- **KlaroConfig** — Library with constants only. No state, no calls.

- **IACPHook / NoopACPHook** — Interface + no-op implementation. No state.
