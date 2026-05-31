# D8b — Cashout + LP-Staking/Slashing + Refund: Money-Flow Correctness Audit

**Auditor:** d8b_cashout_lp_refund  
**Date:** 2026-05-31  
**Scope:** CashoutOrderProcessor, LPStaking, LPRegistry, RefundProtocol, ProofRegistry; web actions; daemon workers  
**Lens:** illegal transitions, idempotency, value conservation, LP stake accounting, slash bounds, expiry/timeout fairness, web-DB vs on-chain divergence, stranded funds, reconciliation gaps

---

## Summary

The cashout + LP + refund subsystem is well-hardened after many prior audit iterations. The contracts enforce strict state-machine transitions, use reentrancy guards, and have good pause coverage. However, several residual findings remain:

| Severity | Count |
|----------|-------|
| HIGH     | 2     |
| MEDIUM   | 4     |
| LOW      | 3     |

**Critical themes:**
1. **Expiry window anchored to wrong timestamp** — `expireUnconfirmed` uses `requestedAt` instead of the proof-submission timestamp, creating unfair early-expiry for fast-claimed orders and unfair late-expiry for slow ones.
2. **Unbounded slash amount** — operator can slash more than the order's USDC value with no cap, enabling disproportionate punishment or griefing.
3. **Web LP claim action checks wrong status** — `claimOrderAction` gates on `REQUESTED` but on-chain and daemon gate on `LOCKED`, creating a permanent divergence where the web path can never succeed for live on-chain orders.

---

## Findings

### [HIGH] expireUnconfirmed uses requestedAt instead of proof-submission timestamp — unfair expiry window

- file: packages/contracts/src/CashoutOrderProcessor.sol:474
- lens: money-flow/cashout-lp-refund
- what: `expireUnconfirmed` checks `block.timestamp < o.requestedAt + CONFIRM_WINDOW`. The CONFIRM_WINDOW (24h) is meant to give the vendor time to confirm after proof is submitted, but it's anchored to `requestedAt` (when the order was created), not when the proof was actually submitted. There is no `proofSubmittedAt` field stored.
- why: If an LP claims and submits proof quickly (e.g., 1 hour after request), the vendor has only 23 hours to confirm. If the LP takes 20 hours to submit proof, the vendor has only 4 hours. Conversely, for orders stuck in LOCKED/CLAIMED state (no proof yet), the operator can expire them after 24h from request — which may be too short for legitimate LP processing. The function also accepts LOCKED and CLAIMED statuses (line 469-472), meaning an order can be expired before any LP even claims it, returning USDC to vendor and potentially stranding an LP who was about to claim.
- fix: Store a `proofSubmittedAt` timestamp in the Order struct (set in `recordProof`). Use `o.proofSubmittedAt + CONFIRM_WINDOW` for PROOF_SUBMITTED orders. For LOCKED/CLAIMED orders, use a separate `CLAIM_WINDOW` or `QUOTE_EXPIRY` check against `quoteExpiresAt`.
- confidence: high

### [HIGH] Unbounded slashAmount in resolveDispute — operator can slash arbitrarily beyond order value

- file: packages/contracts/src/CashoutOrderProcessor.sol:430-449
- lens: money-flow/cashout-lp-refund
- what: In the `SLASH_LP` branch of `resolveDispute`, the `slashAmount` parameter has no upper bound. The only check is `slashAmount == 0` (revert) and `lp.stake < amount` in `LPStaking.slash`. The operator can pass any value up to the LP's entire stake, even if the cashout order was for $10 USDC and the LP has $2000 staked.
- why: A compromised or malicious operator key can drain an LP's entire stake through a single dispute resolution on a trivial order. The slash should be bounded by the order's `usdcAmount` (or a configurable multiplier thereof) to maintain proportionality. This is a value-conservation issue: the LP's collateral exposure should be proportional to the obligation they took on.
- fix: Add `if (slashAmount > o.usdcAmount) revert SlashExceedsOrderValue();` or a configurable `maxSlashMultiplier` (e.g., 2x order value) to cap disproportionate slashing.
- confidence: high

### [MEDIUM] Web LP claimOrderAction checks status "REQUESTED" but on-chain state machine uses "LOCKED"

- file: apps/web/app/lp/actions.ts:162
- lens: money-flow/cashout-lp-refund
- what: `claimOrderAction` checks `if (order.status !== "REQUESTED")` before advancing. But the on-chain `CashoutOrderProcessor` state machine skips REQUESTED entirely — `requestAndLock` creates orders directly in LOCKED status. The daemon's `match-lp` branch also expects on-chain LOCKED. The web action's `advanceCashout` call uses `requireFromStatus: "REQUESTED"` (line 174).
- why: For live on-chain orders (created via `recordCashoutRequestedAction` which writes status "LOCKED" to DB), the LP web claim action will always fail with "order already in state LOCKED". The LP can never claim via the web UI for live orders. Only the daemon's `match-lp` path works. This is a DB↔contract divergence that strands the LP-self-service claim path.
- fix: Change line 162 to accept both `REQUESTED` (legacy mock) and `LOCKED` (live on-chain) statuses, and update `requireFromStatus` on line 174 accordingly. Or remove the web self-service claim for live mode and route exclusively through the daemon.
- confidence: high

### [MEDIUM] expire-quote daemon branch only updates DB, never calls on-chain expireUnconfirmed

- file: apps/daemon/src/workers/cashoutAdvancer.ts:446-456
- lens: money-flow/cashout-lp-refund
- what: The `expire-quote` branch updates the DB status from REQUESTED to EXPIRED but never calls the on-chain `expireUnconfirmed` or `cancel` function. For live on-chain orders, the USDC remains locked in the CashoutOrderProcessor contract while the DB says EXPIRED.
- why: This creates a permanent web-DB vs on-chain divergence. The vendor sees "EXPIRED" in the UI but their USDC is still locked in the escrow contract. The on-chain `expireUnconfirmed` must be called to actually return the USDC. The branch also only targets `status: "REQUESTED"` which doesn't exist on-chain (orders start at LOCKED).
- fix: For live on-chain orders, the expire-quote branch must sign and submit `expireUnconfirmed(cashoutId)` (or `cancel` if still LOCKED and vendor-callable) before flipping the DB. Add the same `arcWallet` + `writeContract` pattern used in the `release` branch.
- confidence: high

### [MEDIUM] REFUND_TO_RESPONDENT outcome pays LP but sets status RESOLVED_LP_PAYS — semantic confusion risks mis-routing

- file: packages/contracts/src/CashoutOrderProcessor.sol:416-422
- lens: money-flow/cashout-lp-refund
- what: When `decision == REFUND_TO_RESPONDENT`, the code sets `status = RESOLVED_LP_PAYS` and transfers USDC to `lpAddr`. In the cashout dispute context, the respondent IS the LP (set in `openDispute` line 283: `lpAddr = respondent`). So "refund to respondent" = "pay the LP" = the LP fulfilled their obligation and the vendor's dispute was unfounded. The status name `RESOLVED_LP_PAYS` is semantically inverted — it reads as "LP pays [a penalty]" but actually means "LP gets paid [the escrowed USDC]".
- why: While the fund flow is technically correct (LP did the payout, vendor disputed wrongly, LP gets the escrowed USDC), the confusing naming creates a high risk of off-chain systems (daemon, UI, analytics) misinterpreting the outcome. Any downstream code that reads `RESOLVED_LP_PAYS` as "LP was penalized" will display wrong information to users or trigger wrong notifications.
- fix: Rename to `RESOLVED_LP_VINDICATED` or `RESOLVED_VENDOR_LOSES` to match the actual semantics. Alternatively, add clear NatSpec documentation and ensure all off-chain consumers map this correctly.
- confidence: medium (naming issue, fund flow is correct)

### [MEDIUM] RefundProtocol sequential nonce creates head-of-line blocking for concurrent refunds

- file: packages/contracts/src/RefundProtocol.sol:42,88-92
- lens: money-flow/cashout-lp-refund
- what: `nonces[vendor]` is a strictly sequential counter. The operator must sign refunds in exact order. If refund #5 is signed but the tx reverts (gas, timing), refunds #6, #7, #8 are all blocked until #5 succeeds or a new signature for #5 is issued.
- why: For a vendor with many concurrent refunds (e.g., a batch return event), a single stuck refund blocks all subsequent ones. The vendor's buyers are waiting for their money. This is a liveness issue under load. The `invoiceId`-based `refunded[invoiceId]` mapping already prevents replay per invoice — the sequential nonce adds ordering constraints that aren't necessary for correctness.
- fix: Switch to a bitmap-based nonce (like Permit2's `nonceBitmap`) or use the `invoiceId` itself as the replay-protection key (it's already checked via `refunded[invoiceId]`). The sequential nonce could be replaced with a deadline-only scheme since `refunded` already prevents double-spend.
- confidence: medium

### [LOW] ProofRegistry.submit does not validate that proof amounts match the on-chain order

- file: packages/contracts/src/ProofRegistry.sol:72-95
- lens: money-flow/cashout-lp-refund
- what: `ProofRegistry.submit()` accepts any `inrAmount` and `usdcAmount` in the proof struct without cross-checking against the actual `CashoutOrderProcessor` order. The only validation is `vendorId != 0`. The caller (CashoutOrderProcessor.recordProof) passes through whatever the operator supplies.
- why: A compromised operator could anchor a proof with mismatched amounts (e.g., proof says $100 but order is $1000), creating a false audit trail. The on-chain receipt would show a different amount than what was actually escrowed. While the actual USDC movement is governed by `o.usdcAmount` in the order (not the proof), the proof is the audit artifact third parties verify.
- fix: In `CashoutOrderProcessor.recordProof`, validate `p.usdcAmount == o.usdcAmount` and `p.inrAmount == o.inrAmount` before calling `proofs.submit(p)`. This ensures the anchored proof matches the canonical order.
- confidence: medium

### [LOW] LPStaking.withdrawStake allows full withdrawal to zero with no minimum-stake floor for active obligations

- file: packages/contracts/src/LPStaking.sol:175-190
- lens: money-flow/cashout-lp-refund
- what: `withdrawStake` allows an LP to withdraw down to 0 stake (tier becomes NONE) as long as `lp.active == true` and `lp.stake >= amount`. There is no check for whether the LP has open/claimed cashout orders. The `active` flag must be manually set by the operator before the LP withdraws.
- why: Race condition: LP claims a cashout order (LOCKED → CLAIMED on-chain), then immediately withdraws their entire stake before submitting proof. If the LP then ghosts (never submits proof), the vendor's USDC is stuck until expiry. When the operator tries to slash the LP for non-performance, the slash reverts `InsufficientStake(0, slashAmount)`. The deferred-slash + write-off path handles this eventually, but the LP escapes penalty entirely.
- fix: Either (a) the operator must `setActive(lpId, false)` atomically with `claimByLP` (requires contract change or daemon coordination), or (b) add a `minStakeForActiveClaims` check that queries open obligations, or (c) accept the write-off path as the designed escape valve and document it as a known risk.
- confidence: medium

### [LOW] Daemon cashoutAdvancer match-lp selects LP by tier only, no corridor/capacity filtering

- file: apps/daemon/src/workers/cashoutAdvancer.ts:225-233
- lens: money-flow/cashout-lp-refund
- what: The `match-lp` branch selects the highest-tier LP with `status: "STAKED"` and `deleted_at: null`, but does not filter by corridor (e.g., INR), capacity, or whether the LP already has too many open claims. It always picks the top-1 LP.
- why: All cashout orders route to the same LP regardless of corridor. An LP registered for INR payouts could be assigned a hypothetical EUR cashout. Additionally, a single high-tier LP monopolizes all assignments, creating concentration risk. If that LP goes offline, all cashouts stall.
- fix: Add corridor filtering (join on `lp_corridors` or a `corridors` array column), capacity limits (count open claims per LP), and round-robin or load-balanced selection.
- confidence: medium (functional but suboptimal for production scale)

---

## Positive Observations (no finding)

1. **Double-release prevention**: `_confirmReceivedTransitions` requires `PROOF_SUBMITTED` status — a second call reverts. Terminal statuses (RELEASED, EXPIRED, CANCELLED, RESOLVED_*) are all write-once. ✓
2. **Double-slash prevention**: `retrySlash` deletes `pendingSlash[cashoutId]` before the external call. A second `retrySlash` reverts `NoPendingSlash`. ✓
3. **LP wallet snapshot**: `claimByLP` snapshots `lpWallet` at assignment time, preventing wallet-rotation attacks between claim and payout. ✓
4. **Dispute context binding**: `resolveDispute` checks `disputes.getCase(cashoutId).context == CASHOUT_DISPUTE_CONTEXT`, preventing cross-context replay. ✓
5. **Idempotent daemon legs**: Each daemon branch reads on-chain status before signing, skipping if already advanced. BullMQ jobId dedup prevents duplicate notifications. ✓
6. **RefundProtocol replay protection**: Both `refunded[invoiceId]` (per-invoice) and `nonces[vendor]` (per-vendor sequential) prevent double-refund. ✓
7. **ProofRegistry AlreadySubmitted**: Deterministic `proofHash` + `submittedAt != 0` check prevents proof replay. ✓
8. **LPStaking fee receiver fail-closed**: `slash()` reverts `FeeReceiverUnset` when `feeReceiver == address(0)` instead of burning to 0xdEaD. ✓
