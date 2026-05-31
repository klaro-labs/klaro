# D3c — Signature Schemes & Replay Protection Audit

## Summary

**Files reviewed:** 22 Solidity contracts + 2 library/interface files in `packages/contracts/src/`

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 2 |
| INFO | 4 |

**Contracts with EIP-712 / signature logic (primary audit targets):**
- `InvoiceEscrow.sol` — EIP-712 buyer acceptance + vendor link authorization
- `RefundProtocol.sol` — EIP-712 vendor refund authorization
- `LPStaking.sol` — EIP-712 operator registration authorization
- `AgentRegistry.sol` — EIP-712 operator registration authorization

**Contracts without on-chain signature verification (operator-gated, no replay surface):**
- `CashoutOrderProcessor.sol`, `MultiChainRouter.sol`, `StableFXAdapterRegistry.sol`, `AgentEscrow.sol`, `RetainerStream.sol`, `DisputeManager.sol`, `FeeSplitter.sol`, `AgentBudgetWallet.sol`, `LPRegistry.sol`, `AuditReceipt.sol`, `CounterpartyRegistry.sol`, `RoutePolicyEngine.sol`, `VendorReputation.sol`, `ReputationManager.sol`, `PrivacyVeil.sol`, `ProofRegistry.sol`, `KlaroConfig.sol`, `MockStableFXAdapter.sol`

---

## Findings

### [HIGH] InvoiceEscrow `createInvoiceFor` — LinkInvoiceAuthorization signature is replayable across multiple invoices with same parameters

- **file:** `packages/contracts/src/InvoiceEscrow.sol:161-185`
- **lens:** signatures/replay
- **what:** The `LINK_INVOICE_AUTH_TYPEHASH` binds `(vendor, token, amount, linkId, authDeadline)` but includes no nonce and no per-invoice uniqueness. The NatSpec at line 63 explicitly states "Intentionally reusable across the link's many payments" and relies on the `AlreadyExists` guard on `invoiceId` to prevent duplicate invoices. However, the signature itself can be used by **any caller** (not just the operator) to create unlimited invoices with distinct `invoiceId` values for the same `(vendor, token, amount)` until `authDeadline` expires. A malicious relayer who obtains one vendor link signature can spam-create invoices on behalf of the vendor, polluting the vendor's invoice namespace and potentially enabling social-engineering attacks where a buyer pays a spam invoice thinking it's legitimate.
- **why:** The design intentionally omits a nonce for UX reasons (one signature covers many link payments). But the lack of any caller restriction means the signature is a bearer credential — anyone who sees it (e.g., from a public Klaro Link URL's frontend JS) can call `createInvoiceFor`. The `invoiceId` uniqueness guard prevents double-creation but not spam-creation of new IDs.
- **fix:** Either (a) restrict `createInvoiceFor` to `onlyOperator` so only the Klaro backend can relay, or (b) add a per-link invoice counter/cap to the signed struct so the vendor commits to a maximum number of invoices per link, or (c) add a mapping tracking how many invoices have been created per `linkId` and enforce a cap.
- **confidence:** HIGH — the code is intentionally designed this way per NatSpec, but the security implication of a bearer-credential signature without caller restriction is a real attack surface.

---

### [MEDIUM] InvoiceEscrow EIP-712 domain separator does not rebind on chain fork

- **file:** `packages/contracts/src/InvoiceEscrow.sol:127`
- **lens:** signatures/replay (chainId rebinding)
- **what:** The constructor calls `EIP712("Klaro Invoice", "1")` which uses OpenZeppelin's EIP-712 implementation. OZ 5.x computes the domain separator lazily via `_domainSeparatorV4()` which **does** recompute on every call if `block.chainid` differs from the cached value (see OZ `EIP712.sol` line ~100). This is **correct** — the domain separator will rebind on fork. However, the contract also enforces `KlaroConfig.requireArcTestnet()` in the constructor (line 127), which hard-reverts if `block.chainid != 5_042_002`. This means the contract **cannot be deployed** on any other chain, making cross-chain replay via deployment on another chain impossible by construction.
- **why:** On a hypothetical hard fork of Arc where the chain ID changes, the `requireArcTestnet()` check only runs at deploy time, not at signature verification time. A fork that retains the same contract state but changes chain ID would still have the OZ lazy-recomputation protect signatures. This is correctly handled.
- **fix:** No fix needed — OZ 5.x lazy domain separator + deploy-time chain lock is defense-in-depth. Documenting this as INFO-level would also be acceptable.
- **confidence:** MEDIUM — noting for completeness; the OZ implementation handles this correctly.

---

### [MEDIUM] RefundProtocol sequential nonce creates DoS vector for vendors with multiple pending refunds

- **file:** `packages/contracts/src/RefundProtocol.sol:89-93`
- **lens:** signatures/replay (nonce management)
- **what:** `RefundProtocol` uses a strictly sequential per-vendor nonce (`nonces[vendor]`). If a vendor signs refund authorizations for invoices A, B, C (nonces 0, 1, 2), they **must** be executed in order. If refund B's execution reverts (e.g., invoice B was already settled by the time the relayer submits), then refund C's signature becomes permanently unusable — the nonce is stuck at 1 and the vendor must re-sign C with nonce 1. This is a liveness issue, not a security issue, but it creates operational fragility.
- **why:** Sequential nonces are the simplest replay-protection scheme but create ordering dependencies. EIP-3009 uses a nonce-bitmap (per-authorization unique nonce) specifically to avoid this. For a refund protocol where multiple refunds may be in-flight simultaneously, sequential ordering is unnecessarily restrictive.
- **fix:** Consider switching to a nonce-bitmap (mapping of used nonces) or a deadline-only scheme with per-invoiceId deduplication (which `refunded[invoiceId]` already provides — the nonce is arguably redundant given the `refunded` mapping).
- **confidence:** HIGH — the sequential nonce + `refunded` mapping is double-protection where the `refunded` mapping alone would suffice for replay prevention, and the nonce adds an ordering constraint that hurts liveness.

---

### [LOW] LPStaking `register` — operator signature does not bind to the staked amount

- **file:** `packages/contracts/src/LPStaking.sol:163-175`
- **lens:** signatures/replay
- **what:** The `REGISTER_TYPEHASH` signs `(lpId, wallet, deadline, nonce)` but does NOT include the `amount` parameter. The operator authorizes "this wallet may register as this LP" but does not commit to the minimum stake amount. A legitimate LP could register with a lower amount than the operator intended (as long as it meets the T0 minimum of $50). This is a weak binding — the operator's KYB process may have approved the LP for a specific tier, but the signature doesn't enforce it.
- **why:** The `amount >= T0` check at line 161 provides a floor, but the operator may have intended a higher minimum (e.g., T2 = $500 for medium auto-eligible). The LP could register at T0 ($50) with a signature the operator issued expecting T2 registration.
- **fix:** Include `uint256 minAmount` in the `REGISTER_TYPEHASH` struct and validate `amount >= minAmount` in `register()`. Alternatively, document that the operator's authorization is tier-agnostic and tier enforcement is post-registration.
- **confidence:** MEDIUM — depends on whether the operator's intent includes tier-gating at registration time.

---

### [LOW] AgentRegistry `registerAgent` — operator signature does not bind to feeBps or metadata

- **file:** `packages/contracts/src/AgentRegistry.sol:96-108`
- **lens:** signatures/replay
- **what:** The `REGISTER_TYPEHASH` signs `(agentId, owner, deadline, nonce)` but does NOT include `feeBps`, `displayName`, or `pricingEndpointUrl`. The operator authorizes "this owner may register this agentId" but the registrant can set any `feeBps` up to `maxAgentFeeBps` (currently 20%) and any metadata strings. If the operator's KYB/vetting process approved a specific fee schedule, the on-chain signature doesn't enforce it.
- **why:** Same pattern as LPStaking — the signature gates identity binding but not business parameters. The `feeBps > maxAgentFeeBps` check provides a ceiling but not a per-agent floor.
- **fix:** Include `uint16 maxFeeBps` in the signed struct if per-agent fee caps are desired. Alternatively, document that fee enforcement is post-registration via `updateAgent` restrictions.
- **confidence:** MEDIUM — the `maxAgentFeeBps` global cap mitigates the worst case (100% fee), but per-agent binding may be desired.

---

### [INFO] All EIP-712 contracts use OpenZeppelin `SignatureChecker.isValidSignatureNow` — no raw `ecrecover` misuse

- **file:** All signature-verifying contracts
- **lens:** signatures/replay (ecrecover safety)
- **what:** None of the contracts use raw `ecrecover`. All use OZ `SignatureChecker.isValidSignatureNow(signer, digest, signature)` which:
  1. Tries `ECDSA.recover` internally (handles `v` normalization, rejects `s` in upper half per EIP-2, returns `address(0)` on failure)
  2. Falls back to EIP-1271 `isValidSignature` for smart contract wallets
  3. The caller then checks `recovered == expectedSigner` (implicit in `isValidSignatureNow` returning bool)
  
  This eliminates the classic `ecrecover` pitfalls: zero-address return, s-malleability, and v=27/28 handling.
- **why:** Clean pattern. No issues.
- **fix:** None needed.
- **confidence:** HIGH

---

### [INFO] No EIP-3009 `transferWithAuthorization` or EIP-2612 `permit` used directly in any contract

- **file:** All contracts in `packages/contracts/src/`
- **lens:** signatures/replay (EIP-3009/Permit2)
- **what:** Despite `KlaroConfig` pinning the Permit2 address (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) and the NatSpec mentioning "Permit2 — gasless approvals via EIP-712", no contract in the current codebase calls Permit2 or uses EIP-2612 `permit()` or EIP-3009 `transferWithAuthorization`. All token movements use standard `safeTransferFrom` (requiring prior `approve`). The StableFX corridor mentions "Permit2" in the README but the actual `StableFXAdapterRegistry.swap()` uses `safeTransferFrom(payer, ...)`.
- **why:** This means there's no Permit2/EIP-3009 replay surface to audit. The Permit2 integration appears to be planned but not yet implemented.
- **fix:** None needed currently. When Permit2 is integrated, audit for: nonce reuse, deadline enforcement, and witness data binding.
- **confidence:** HIGH

---

### [INFO] Deadline enforcement is correct across all signature-gated paths

- **file:** 
  - `InvoiceEscrow.sol:170` — `if (block.timestamp > authDeadline) revert AuthExpired()`
  - `RefundProtocol.sol:85` — `if (block.timestamp > expiresAt) revert ExpiredAuthorization(...)`
  - `LPStaking.sol:159` — `if (block.timestamp > deadline) revert BadOperatorAuth()`
  - `AgentRegistry.sol:100` — `if (block.timestamp > deadline) revert BadOperatorAuth()`
- **lens:** signatures/replay (deadline/expiry)
- **what:** All four EIP-712 signature paths enforce a deadline/expiry check BEFORE signature verification. The check uses strict `>` (not `>=`), meaning a signature is valid in the exact second of its deadline. This is standard and correct.
- **why:** No issues. Deadlines are enforced consistently.
- **fix:** None needed.
- **confidence:** HIGH

---

### [INFO] State-changing paths that could benefit from signature gating but use operator-trust instead

- **file:** 
  - `CashoutOrderProcessor.sol:178-189` — `operatorConfirmReceived` (operator confirms on vendor's behalf without vendor signature)
  - `AgentEscrow.sol:218-240` — `resolveDispute` (operator resolves with `payToAgent` bool, validated against on-chain outcome)
  - `DisputeManager.sol:148-180` — `decide` (operator stamps final outcome)
- **lens:** signatures/replay (missing signature where one could exist)
- **what:** Several state-changing paths that move USDC rely on operator-key trust rather than requiring a signature from the affected party. Most notably, `operatorConfirmReceived` releases escrowed USDC to the LP on the vendor's behalf without the vendor signing anything on-chain — the vendor's confirmation happens off-chain (web action) and the operator relays it. This is a design choice (SMB vendors without signing infrastructure), not a bug.
- **why:** The operator is a trusted role. The defense-in-depth is: (a) `expectedVendor` parameter cross-check, (b) the vendor can also call `confirmReceived` directly, (c) dispute path exists if the operator acts maliciously. This is acceptable for the stated threat model (operator is trusted, multisig in prod).
- **fix:** No fix required for current threat model. For a trust-minimized version, vendor EIP-712 signatures on confirm/dispute-resolution would remove operator as a single point of trust for fund release.
- **confidence:** HIGH — this is a documented design decision, not a vulnerability.

---

## Clean Areas (No Issues Found)

| Contract | Signature Relevance | Status |
|----------|-------------------|--------|
| `FeeSplitter.sol` | No signatures | ✅ Clean — trusted-caller gated |
| `AgentBudgetWallet.sol` | No signatures | ✅ Clean — owner-only spend |
| `RetainerStream.sol` | No signatures | ✅ Clean — party-gated lifecycle |
| `DisputeManager.sol` | No signatures | ✅ Clean — operator + trusted-caller gated |
| `MultiChainRouter.sol` | No signatures | ✅ Clean — operator-only bridge |
| `StableFXAdapterRegistry.sol` | No signatures | ✅ Clean — operator-only swap |
| `LPRegistry.sol` | No signatures | ✅ Clean — operator-only writes |
| `AuditReceipt.sol` | No signatures | ✅ Clean — operator-only mint |
| `CounterpartyRegistry.sol` | No signatures | ✅ Clean — operator-only cache |
| `RoutePolicyEngine.sol` | No signatures | ✅ Clean — operator-only config |
| `VendorReputation.sol` | No signatures | ✅ Clean — authorized-only writes |
| `ReputationManager.sol` | No signatures | ✅ Clean — operator-only snapshot |
| `PrivacyVeil.sol` | No signatures | ✅ Clean — trusted-caller commit |
| `ProofRegistry.sol` | No signatures | ✅ Clean — operator-only submit |
| `MockStableFXAdapter.sol` | No signatures | ✅ Clean — trusted-caller swap |

---

## Architecture Notes

1. **EIP-712 domain separation is consistent:** All four EIP-712 contracts use distinct `(name, version)` pairs:
   - `InvoiceEscrow`: `("Klaro Invoice", "1")`
   - `RefundProtocol`: `("Klaro Refund", "1")`
   - `LPStaking`: `("Klaro LPStaking", "1")`
   - `AgentRegistry`: `("Klaro AgentRegistry", "1")`
   
   This prevents cross-contract signature replay even if type hashes collide (they don't — all are distinct).

2. **Cross-chain replay is impossible by construction:** `KlaroConfig.requireArcTestnet()` in every constructor pins deployment to chain ID `5_042_002`. Combined with OZ's lazy domain separator recomputation, signatures are chain-bound.

3. **No Permit2/EIP-3009 surface exists yet:** The codebase pins Permit2's address but never calls it. When integrated (likely for StableFX), a follow-up audit of the permit flow will be needed.

4. **Nonce schemes are appropriate for their contexts:**
   - `RefundProtocol`: sequential per-vendor (functional but creates ordering dependency — see MEDIUM finding)
   - `LPStaking`: sequential per-lpId (appropriate — one registration per entity)
   - `AgentRegistry`: sequential per-agentId (appropriate — one registration per entity)
   - `InvoiceEscrow` acceptance: no nonce needed (invoiceId uniqueness + status machine provides replay protection)
   - `InvoiceEscrow` link auth: no nonce (intentionally reusable — see HIGH finding)
