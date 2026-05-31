# Economic / Arithmetic / DoS Audit — Klaro Contracts

**Auditor lens:** arithmetic rounding/precision loss, fee/split math errors, integer truncation, oracle manipulation (Pyth usage), MEV/front-running, griefing/DoS (unbounded loops, gas limits, block-stuffing), fund-locking conditions, economic invariant violations.

**Scope:** All 22 Solidity files in `packages/contracts/src/` (+ `adapters/`, `lib/`).

**Date:** 2026-05-31

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 3     |
| MEDIUM   | 5     |
| LOW      | 4     |

The codebase is well-hardened — most classic arithmetic/DoS vectors have already been closed in prior audit iterations. The remaining findings center on: (1) rounding dust that can be weaponized in the FeeSplitter BPS math, (2) economic invariant violations in the RetainerStream vesting math under edge conditions, (3) front-running vectors in the cashout/LP flow, and (4) residual fund-locking paths in dispute resolution.

---

## Findings

### [HIGH] FeeSplitter: last-payee dust accumulation can be weaponized via many micro-invoices

- **file:** `packages/contracts/src/FeeSplitter.sol:155-162` (also `distributeAdHoc` at line 131-140)
- **lens:** arithmetic/precision-loss
- **what:** The `(amount * bps) / 10_000` truncation assigns the rounding remainder to the last payee in the array. For a split like `[3333, 3333, 3334]` on a 1 USDC (1_000_000 units) invoice, each intermediate payee gets `floor(1_000_000 * 3333 / 10_000) = 333_300`. Distributed = 666_600. Last payee gets `1_000_000 - 666_600 = 333_400` — 100 units ($0.0001) more than their fair share. Over thousands of micro-invoices, a vendor who controls the splits array can position their own address last and accumulate meaningful dust at the expense of the protocol treasury or other payees.
- **why:** The dust-to-last pattern is standard (OZ PaymentSplitter), but Klaro lets the *vendor* define the splits array and choose payee ordering. A malicious vendor sets themselves as the last payee in every invoice, systematically extracting 1-2 units per split per invoice. At 10k invoices/day this is ~$0.01-0.02/day — low individually but violates the "value conserved per-payee" invariant the NatSpec claims.
- **fix:** Either (a) randomize/sort the payee array by address before distributing so the dust recipient is non-deterministic, or (b) send dust to a protocol-controlled address, or (c) document this as accepted behavior given USDC's 6-decimal granularity makes the economic impact negligible.
- **confidence:** Medium — economically real but low absolute value per-invoice. Severity is HIGH because it's a systematic invariant violation the NatSpec explicitly claims doesn't exist ("sum(payouts_i) == amount — value conserved").

---

### [HIGH] RetainerStream: vesting math truncation can leave 1 unit of USDC permanently locked

- **file:** `packages/contracts/src/RetainerStream.sol:296`
- **lens:** arithmetic/fund-locking
- **what:** `_vested(s, block.timestamp)` computes `(deposit * elapsed) / span`. When `deposit * elapsed` is not evenly divisible by `span`, the truncation means `vested(endAt) = deposit` (correct at maturity), but `cancelledVested` at any intermediate time `t` is `floor(deposit * (t - startAt) / (endAt - startAt))`. The refund is `deposit - cancelledVested`. The recipient can later withdraw up to `cancelledVested - withdrawn`. The sum `withdrawn + refund + (cancelledVested - withdrawn)` always equals `deposit` — so the conservation invariant holds. **However**, if the recipient has already withdrawn some amount and then the payer cancels at a time where `_vested` truncates down, the `cancelledVested` snapshot can be *less* than `withdrawn` (since `withdrawn` was based on a prior `_vested` call that returned a higher value at a different block). This would cause `_withdrawable` to underflow: `vestedNow - withdrawn` where `vestedNow < withdrawn`.
- **why:** Actually, re-examining: `_vested` is monotonically non-decreasing over time (elapsed only grows), so `cancelledVested >= any prior _vested(t')` for `t' < t`. The underflow cannot happen in normal flow. **Revised:** The real issue is that at `endAt`, `_vested = deposit` exactly (no truncation). But if `cancelStream` is called at `endAt - 1` second, the recipient loses `deposit - floor(deposit * (span-1) / span)` which can be 1 unit. This 1 unit goes to the payer as "refund" even though the recipient was 1 second from full vesting. This is by-design linear vesting behavior, not a bug.
- **why (revised):** After careful re-analysis, the conservation invariant holds. Downgrading.
- **fix:** N/A — the math is correct. The truncation favors the payer by at most 1 unit at any cancellation point, which is standard for integer-division linear vesting.
- **confidence:** Low — false alarm on re-analysis. **RETRACTED.**

---

### [HIGH] AgentEscrow: IACPHook gas griefing can force out-of-gas on agent lifecycle transitions

- **file:** `packages/contracts/src/AgentEscrow.sol:310-316` (`_safeBefore` / `_safeAfter`)
- **lens:** DoS/griefing
- **what:** The `_safeBefore` and `_safeAfter` wrappers use try/catch to prevent a malicious hook from blocking transitions. However, the try/catch only catches *reverts*, not out-of-gas. If the hook consumes all remaining gas (e.g., an infinite loop that doesn't revert), the entire transaction fails — the try/catch doesn't catch OOG. A malicious principal can deploy a hook that burns `gasleft() - 1` gas in `beforeAction`, causing the outer transaction to fail with OOG, effectively blocking the agent from calling `startJob`, `submitDeliverable`, or `openDispute`.
- **why:** Solidity's try/catch does NOT catch out-of-gas errors in the called contract when the caller itself runs out of gas. The 63/64 rule means the inner call gets 63/64 of remaining gas; if it consumes all of it, the outer frame has only 1/64 left — insufficient to complete the state transition. The hook can be crafted to always consume exactly enough gas to leave the outer frame unable to proceed.
- **fix:** Forward only a bounded amount of gas to the hook call: `hook.beforeAction{gas: HOOK_GAS_LIMIT}(...)` where `HOOK_GAS_LIMIT` is a constant (e.g., 100_000). This ensures the outer frame always retains enough gas to complete regardless of hook behavior.
- **confidence:** High — this is a well-known Solidity try/catch limitation. The principal controls the hook address at job creation time.

---

### [HIGH] CashoutOrderProcessor: operator-controlled `slashAmount` in SLASH_LP has no upper bound relative to escrowed USDC

- **file:** `packages/contracts/src/CashoutOrderProcessor.sol:262`
- **lens:** economic invariant violation
- **what:** In `resolveDispute` with `SLASH_LP` outcome, the operator supplies `slashAmount` as a free parameter. The contract pays the vendor `o.usdcAmount` from escrow AND slashes `slashAmount` from the LP's stake. There is no validation that `slashAmount <= o.usdcAmount` or any other bound. A compromised operator can slash the LP's entire stake (far exceeding the order value) while the vendor receives only the escrowed amount. The LP loses disproportionately.
- **why:** The slash is a penalty, so exceeding the order value may be intentional (punitive). However, there's no hard cap — a compromised operator key can drain an LP's entire stake in a single call by setting `slashAmount = lp.stake`. The `LPStaking.slash` only checks `lp.stake >= amount`, not any relationship to the dispute's economic value.
- **fix:** Add a maximum slash ratio (e.g., `slashAmount <= o.usdcAmount * MAX_SLASH_MULTIPLIER / 100`) or require owner approval for slashes exceeding the order value.
- **confidence:** High — the code path is clear. Whether this is "by design" depends on governance assumptions, but the unbounded nature is a real economic risk for LPs.

---

### [MEDIUM] InvoiceEscrow: front-running `acceptAndPay` with `cancelInvoice` 

- **file:** `packages/contracts/src/InvoiceEscrow.sol:186-188` (`cancelInvoice`) and `206-240` (`acceptAndPay`)
- **lens:** MEV/front-running
- **what:** A vendor can watch the mempool for a buyer's `acceptAndPay` transaction and front-run it with `cancelInvoice`. The buyer's transaction then reverts with `InvalidStatus(CREATED, CANCELLED)`. The buyer wasted gas and their EIP-712 signature is now consumed (the invoice is cancelled, so the signature can never be used). If the vendor re-creates the invoice with the same parameters but a new `invoiceId`, the buyer must re-sign.
- **why:** On Arc with sub-second finality, the MEV window is narrow but non-zero. The vendor has no economic incentive to do this in normal operation, but it's a griefing vector (e.g., vendor wants to change terms after seeing the buyer commit). The buyer's only cost is gas, but the UX disruption is real.
- **fix:** Consider a brief acceptance window where cancellation is blocked once the invoice enters a "pending acceptance" state, or accept this as inherent to the two-step flow.
- **confidence:** Medium — the vector exists but economic incentive is low and Arc's fast finality limits the window.

---

### [MEDIUM] MockStableFXAdapter: rate manipulation by owner between quote and swap

- **file:** `packages/contracts/src/adapters/MockStableFXAdapter.sol:100-115`
- **lens:** oracle manipulation / front-running
- **what:** The `quote()` function reads `rate[srcToken][dstToken]` which the owner can change at any time via `setRate`. The `swap()` function re-computes the quote fresh (line 108: `quote(srcToken, dstToken, srcAmount)`) rather than using the cached `expectedQuoteHash`. If the owner calls `setRate` between the user's quote and the operator's `swap` call, the user gets a different rate than quoted. The `expectedQuoteHash` check catches this (the fresh hash won't match), BUT the `expectedQuoteHash != bytes32(0)` guard means if the registry ever passes `bytes32(0)` the check is skipped entirely.
- **why:** The `StableFXAdapterRegistry.swap` now rejects `bytes32(0)` via `EmptyQuoteHash()` (line 175), so the registry-level path is safe. However, if the adapter is called directly by a trusted caller that isn't the registry (future integration), the `bytes32(0)` bypass remains. Additionally, the owner can sandwich: `setRate(high) → swap executes → setRate(normal)` within the same block if they're also the trusted caller.
- **fix:** This is a mock adapter explicitly labeled `[SIMULATED]` — the risk is accepted for testnet. For mainnet, the real CircleStableFXAdapter should use Pyth oracle prices with staleness checks rather than owner-set rates.
- **confidence:** Medium — real vector but mitigated by the "mock/simulated" label and registry-level `EmptyQuoteHash` guard.

---

### [MEDIUM] RetainerStream: `resolveDispute` payer-win refunds unvested amount without checking contract balance

- **file:** `packages/contracts/src/RetainerStream.sol:275-278`
- **lens:** fund-locking / economic invariant
- **what:** When `resolveDispute` determines `payerWon`, it computes `refund = s.deposit - vestedNow` and transfers it to the payer. However, the contract's actual USDC balance may be less than `refund` if other streams have been funded with the same token and the contract's aggregate balance is shared. Each stream's deposit is tracked individually, but the USDC sits in a single pool. If the contract is underfunded (e.g., due to a bug in another stream's withdrawal), the `safeTransfer` reverts and the dispute resolution is permanently blocked.
- **fix:** This is inherent to the pooled-balance model. The invariant `sum(all deposits - all withdrawals - all refunds) == contract.balance` should always hold if the code is correct. Add a view function that asserts this invariant for monitoring. No code fix needed unless a separate bug breaks the invariant.
- **confidence:** Low-Medium — the invariant should hold if all other code paths are correct. This is a defense-in-depth observation rather than an exploitable bug.

---

### [MEDIUM] AgentEscrow: fee calculation truncation allows zero-fee jobs for small amounts

- **file:** `packages/contracts/src/AgentEscrow.sol:155`
- **lens:** arithmetic/precision-loss
- **what:** `fee = (amountUsdc * feeBps) / 10_000`. For `amountUsdc < 10_000 / feeBps`, the fee truncates to 0. Example: if `feeBps = 200` (2%), any job with `amountUsdc < 50` (i.e., $0.00005 in 6-dec USDC) pays zero protocol fee. For `feeBps = 100` (1%), jobs under 100 units ($0.0001) are fee-free.
- **why:** The minimum practical invoice on Klaro is likely $1+ (1_000_000 units), so this truncation is economically irrelevant for real usage. However, an agent could register with `feeBps = 1` (0.01%) and accept jobs at 9_999 units ($0.009999) — each paying 0 fee — to systematically avoid protocol fees while still processing real micro-work.
- **fix:** Add a minimum fee floor (e.g., `fee = max((amountUsdc * feeBps) / 10_000, MIN_FEE)`) or enforce a minimum `amountUsdc` in `createJob`.
- **confidence:** Medium — mathematically correct but economically exploitable at micro-amounts. Practical impact depends on whether sub-dollar jobs are a real use case.

---

### [MEDIUM] CashoutOrderProcessor: `expireUnconfirmed` window starts from `requestedAt`, not from `PROOF_SUBMITTED` transition

- **file:** `packages/contracts/src/CashoutOrderProcessor.sol:290-295`
- **lens:** fund-locking / economic invariant
- **what:** The expiry check is `block.timestamp < o.requestedAt + CONFIRM_WINDOW`. The `CONFIRM_WINDOW` is 24 hours. But the order may sit in LOCKED or CLAIMED state for hours/days before reaching PROOF_SUBMITTED. If the LP takes 23 hours to submit proof, the vendor has only 1 hour to confirm before the operator can expire. Conversely, if the LP is fast (proof in 1 minute), the vendor has nearly 24 hours. The window is measured from the wrong anchor point.
- **why:** This creates an inconsistent UX and potential fund-locking: if the LP is slow AND the operator calls `expireUnconfirmed` immediately after the window, the vendor may not have had reasonable time to review the proof. The vendor's USDC is returned (not locked), but the LP did real work (sent fiat) and gets nothing — creating an economic loss for the LP with no dispute path (the order is EXPIRED, not DISPUTED).
- **fix:** Track `proofSubmittedAt` timestamp and use `block.timestamp < o.proofSubmittedAt + CONFIRM_WINDOW` for the expiry check. This gives the vendor a consistent 24-hour review window regardless of LP speed.
- **confidence:** High — the code clearly uses `requestedAt` not a proof-submission timestamp. Whether this is intentional (to bound total order lifetime) or a bug depends on design intent.

---

### [LOW] FeeSplitter: `distributeAdHoc` accepts `Split[] calldata` from InvoiceEscrow but InvoiceEscrow passes `Split[] memory`

- **file:** `packages/contracts/src/FeeSplitter.sol:119` and `packages/contracts/src/InvoiceEscrow.sol:260`
- **lens:** economic (gas griefing)
- **what:** `InvoiceEscrow.settle` calls `feeSplitter.distributeAdHoc(inv.token, inv.amount, splits)` where `splits` is a `Split[] memory` array read from storage. The `distributeAdHoc` function signature accepts `Split[] calldata`. Solidity handles the memory→calldata conversion via an external call (ABI encoding), but the gas cost scales with the number of splits. A vendor who creates an invoice with many splits (e.g., 100 payees at 100 BPS each) forces the settle transaction to consume significant gas for the ABI encoding + loop iteration.
- **why:** The `_validateSplits` function has no upper bound on `splits.length`. While gas cost is borne by the operator (who calls `settle`), a malicious vendor could create invoices with maximum splits to grief the operator's gas budget. At 100 splits, the settle tx might cost 500k+ gas.
- **fix:** Add a `MAX_SPLITS` constant (e.g., 20) in `_validateSplits` to bound the loop and gas cost.
- **confidence:** Medium — the vector exists but the operator can simply refuse to settle unreasonable invoices off-chain.

---

### [LOW] LPStaking: `withdrawStake` allows withdrawal to zero stake without deregistration

- **file:** `packages/contracts/src/LPStaking.sol:186-195`
- **lens:** economic invariant
- **what:** An LP can `withdrawStake` their entire balance, leaving `stake = 0` and `tier = NONE`. The LP record still exists (`joinedAt != 0`) but is effectively dead. The LP can't be slashed (slash requires `lp.stake >= amount`), can't be re-tiered, and occupies storage permanently. If the LP has open cashout obligations (claimed orders), the CashoutOrderProcessor can't slash them on dispute loss.
- **why:** The `active` flag and `LPSuspended` check on withdrawal (when `!lp.active`) partially mitigates this — the operator should suspend before the LP withdraws. But if the operator is slow, the LP can race to withdraw before suspension.
- **fix:** Either (a) enforce a minimum stake that can't be withdrawn while `active == true`, or (b) check for open obligations in CashoutOrderProcessor before allowing withdrawal (cross-contract check), or (c) accept this as an operational risk mitigated by the suspend-before-slash workflow.
- **confidence:** Medium — the race condition is real but requires operator negligence.

---

### [LOW] ReputationManager: `computeScore` can overflow for extreme multiplier × weight combinations

- **file:** `packages/contracts/src/ReputationManager.sol:131-135`
- **lens:** arithmetic
- **what:** `amplified += bucket * m` where `bucket` is `int256` (sum of `int32` weights) and `m` is `int256(kindMultiplier[...])` which is `int16`. For a vendor with millions of events all in one bucket, `bucket` could theoretically reach `int32.max * eventCount`. With `m = 5` (max configured), `bucket * m` could overflow `int256` only if `bucket > type(int256).max / 5` — which requires ~1.15e76 events. This is physically impossible.
- **why:** No real overflow risk given the `int32` weight per event and practical event counts. The O(1) running sum in VendorReputation caps `bucket` at `int32.max * eventCount` which for any realistic eventCount (< 2^64) stays well within int256.
- **fix:** No fix needed — the math is safe for any realistic input.
- **confidence:** High that this is NOT a real issue.

---

### [LOW] MockStableFXAdapter: `quoteTtl = 0` causes division by zero in `quote()`

- **file:** `packages/contracts/src/adapters/MockStableFXAdapter.sol:96`
- **lens:** DoS
- **what:** `uint64 ttl = quoteTtl == 0 ? 1 : quoteTtl;` — this line already handles the zero case by defaulting to 1. No issue.
- **why:** Already mitigated in code.
- **fix:** N/A.
- **confidence:** High — no issue. **RETRACTED.**

---

### [LOW] InvoiceEscrow: `createInvoiceWithSplits` unbounded storage writes

- **file:** `packages/contracts/src/InvoiceEscrow.sol:155-158`
- **lens:** DoS/gas
- **what:** The `for` loop in `createInvoiceWithSplits` pushes each split to storage with no upper bound on `splits.length`. A vendor can pass hundreds of splits (each summing to 10_000 BPS via tiny values like 1 BPS each for 10_000 payees). This makes the `settle` call extremely expensive (reading 10_000 storage slots + 10_000 transfers).
- **why:** The `_validateSplits` function only checks that BPS sum to 10_000 and that no payee is zero/no bps is zero. It doesn't limit array length. A malicious vendor could create an invoice that is economically impossible to settle within block gas limits.
- **fix:** Add `if (splits.length > MAX_SPLITS) revert TooManySplits();` in `_validateSplits`. A reasonable cap is 20-50 payees.
- **confidence:** High — the unbounded loop is clearly present and the settle path reads all splits from storage.

---

## Non-Findings (Investigated, No Issue)

1. **Pyth Oracle usage:** `KlaroConfig.PYTH_ORACLE` is pinned but never called from any contract in scope. No oracle manipulation vector exists on-chain today.

2. **FeeSplitter conservation invariant:** The dust-to-last-payee pattern ensures `sum(payouts) == amount` always holds. No value is created or destroyed at the contract level.

3. **RetainerStream vesting math:** `_vested` is monotonically non-decreasing and equals `deposit` exactly at `endAt`. The conservation invariant `deposit == withdrawn + refund + remaining` holds in all states.

4. **InvoiceEscrow EIP-712 replay:** Nonces are not used (invoiceId uniqueness + status machine prevents replay). Each invoiceId can only be accepted once (CREATED → PAID is one-way).

5. **RefundProtocol replay:** Strict nonce ordering (`nonces[vendor] != nonce` check) + `refunded[invoiceId]` mapping prevents double-refund.

6. **AgentBudgetWallet daily cap reset:** The window rolls on first `spend` after expiry, not on a fixed schedule. This means the cap resets relative to the first spend, not midnight. This is by-design (documented in NatSpec) and doesn't create an economic exploit.
