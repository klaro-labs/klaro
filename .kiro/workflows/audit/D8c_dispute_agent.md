# D8c — Dispute / Agent-Job / Retainer / FX-CrossChain Audit

**Auditor:** d8c_dispute_agent_fx  
**Date:** 2026-05-31  
**Scope:** DisputeManager, ReputationManager, VendorReputation, AgentEscrow, AgentBudgetWallet, AgentRegistry, RetainerStream, MultiChainRouter, StableFXAdapterRegistry, RoutePolicyEngine; web repos (disputes.ts, agentJobs.ts); daemon arcSubscriber Decided + JobCompleted handlers.  
**Lens:** Illegal transitions, idempotency, value conservation, budget-cap enforcement, dispute→fund-movement correctness, web-DB vs on-chain divergence, stranded funds, FX rate/slippage handling.

---

## Summary

The contracts are well-hardened — most historical attack vectors (front-running, reentrancy, stranded funds, context-hijack) have been closed with documented fixes. The remaining findings are concentrated in:

1. **Daemon↔DB divergence** — the `Decided` event handler does not fan out to `AgentEscrow.resolveDispute` or `RetainerStream.resolveDispute`, leaving on-chain funds frozen until manual operator intervention.
2. **Missing outcome mapping** — `MUTUAL_RESOLVED` (outcome 5) is silently dropped by the daemon's DB sync, creating a permanent DB↔chain split.
3. **Web repo `agentJobs.ts` has no DISPUTED/CANCELLED status-timestamp column**, so the DB row never records when a job entered dispute.
4. **RetainerStream `resolveDispute` refund ignores already-withdrawn amount** — the `refund = deposit - vestedNow` calculation can attempt to transfer more USDC than the contract holds for that stream if the recipient withdrew before the dispute was opened.

**Critical (P0):** 1 finding  
**High (P1):** 3 findings  
**Medium (P2):** 4 findings  
**Low (P3):** 2 findings

---

## Findings

### [P0-CRIT] RetainerStream.resolveDispute refund can exceed contract's per-stream balance

- file: packages/contracts/src/RetainerStream.sol:336-339
- lens: money-flow / value-conservation
- what: When `payerWon == true`, the refund is computed as `deposit - vestedNow`. But the recipient may have already withdrawn part of the vested amount before the dispute was opened (withdraw is allowed until `disputes.isDecided(streamId)` returns true — which only happens AFTER the operator calls `DisputeManager.decide`). The contract transfers `deposit - vestedNow` to the payer, but the actual USDC held for this stream is `deposit - withdrawn`. If `withdrawn > 0` and `vestedNow > withdrawn` (normal case: recipient withdrew some but not all vested), the refund `deposit - vestedNow` is correct. BUT if the dispute is opened at time T1, the recipient withdraws up to `vested(T1)` before the decision lands, and the decision lands at T2 > T1, then `vestedNow = vested(T2) > vested(T1)`. The refund `deposit - vested(T2)` is less than `deposit - withdrawn` so it's safe. HOWEVER: the `DisputeAwaitingResolution` guard only blocks withdrawals AFTER `disputes.isDecided(streamId)` is true. Between `openDispute` (case status = OPENED) and `decide` (case status = DECIDED), the recipient can still withdraw freely because `isDecided` returns false. A recipient who sees the dispute going against them can drain all vested USDC in this window. Then when `resolveDispute` fires with `payerWon=true`, it tries to transfer `deposit - vestedNow` but the contract only holds `deposit - withdrawn` for this stream (and potentially less if other streams share the contract). The `safeTransfer` will revert if the contract is underfunded, but if other streams' deposits cover the shortfall, those streams' funds are stolen.
- why: The `DisputeAwaitingResolution` check in `withdraw()` (line 272) only fires when `disputes.isDecided(streamId)` is true. Between OPENED and DECIDED (which can be days/weeks), the recipient can withdraw all vested funds. The payer-won refund path doesn't account for `withdrawn`.
- fix: In `resolveDispute`, when `payerWon`, compute `refund = deposit - vestedNow - withdrawn` (the actual unvested+undrawn amount). Or: freeze withdrawals from the moment a dispute is opened (check `disputes.getCase(streamId).status != NONE` in withdraw, not just `isDecided`).
- confidence: HIGH — the code path is clear; the only mitigation is that `safeTransfer` reverts if the contract is underfunded, but in a multi-stream contract this drains other streams' deposits.

---

### [P1-HIGH] Daemon Decided handler does not fan out to AgentEscrow.resolveDispute or RetainerStream.resolveDispute

- file: apps/daemon/src/listener/arcSubscriber.ts:13-14 (comment), lines ~380-400 (Decided handler)
- lens: dispute-agent-fx / web-DB vs on-chain divergence
- what: The `Decided` event handler syncs the DB row to DECIDED and enqueues `notify-admin`. The comment on line 13 explicitly states: "fan-out to cashout/agent advancer is F8-pending — outcome-enum-driven business logic + advancer wiring not yet in scope; admin manually advances based on the notify-admin payload." This means after a dispute is decided on-chain, the `AgentEscrow` job stays in DISPUTED state and the `RetainerStream` stays frozen until an operator manually calls `resolveDispute` on each contract. If the operator misses the notification or is delayed, funds are stranded indefinitely.
- why: The daemon is the only automated bridge between on-chain events and downstream contract calls. Without automated fan-out, the system relies on manual operator action for every dispute resolution — a single point of failure for fund release.
- fix: Add a worker (e.g. `dispute-resolve-advancer`) that, on receiving a Decided event, determines the context (agent/stream/cashout) from the DB row's `source` field and calls the appropriate contract's `resolveDispute`. Gate behind the operator wallet's signing capability.
- confidence: HIGH — the code comment confirms this is a known gap; the impact is real (funds frozen until manual action).

---

### [P1-HIGH] Daemon DB_OUTCOME map missing MUTUAL_RESOLVED (outcome=5) — silent DB divergence

- file: apps/daemon/src/listener/arcSubscriber.ts:~385 (DB_OUTCOME map)
- lens: dispute-agent-fx / web-DB vs on-chain divergence
- what: The `DB_OUTCOME` map is `{1: "RELEASE_TO_CLAIMANT", 2: "REFUND_TO_RESPONDENT", 3: "SLASH_LP", 4: "PENALIZE_VENDOR"}`. The on-chain `DisputeManager.Outcome` enum has 6 values: NONE(0), RELEASE_TO_CLAIMANT(1), REFUND_TO_RESPONDENT(2), SLASH_LP(3), PENALIZE_VENDOR(4), MUTUAL_RESOLVED(5). If a case is decided with outcome=5 (MUTUAL_RESOLVED), the daemon writes `status: "DECIDED"` but `outcome` is undefined (the spread `...(outcome ? { outcome } : {})` skips it). The DB row shows DECIDED with no outcome — downstream UI and reconciliation logic cannot determine what happened.
- why: The DisputeManager contract's `decide()` function currently rejects MUTUAL_RESOLVED for escrow-backed cases (context != 0), but allows it for ad-hoc cases (context == 0). Any ad-hoc dispute decided as MUTUAL_RESOLVED will have a permanently null outcome in the DB.
- fix: Add `5: "MUTUAL_RESOLVED"` to the `DB_OUTCOME` map.
- confidence: HIGH — the enum mismatch is visible in the code.

---

### [P1-HIGH] Web repo agentJobs.ts advanceJob has no guard against double-advance (no status precondition)

- file: apps/web/lib/repo/agentJobs.ts:109-125
- lens: idempotency / illegal transitions
- what: `advanceJob` performs `.update({status: to}).eq("job_id", jobId)` with no `.eq("status", expectedCurrentStatus)` precondition. While the action layer (`vendor/agents/actions.ts:85-100`) checks `LEGAL_NEXT[job.status].includes(to)`, this check is TOCTOU-vulnerable: two concurrent requests can both read status=STARTED, both pass the check, and both write. The first writes DELIVERED, the second writes DISPUTED (or vice versa). The DB ends up in whichever write lands last — potentially an illegal state that diverges from on-chain.
- why: The repo layer is the persistence boundary. Without an atomic conditional update (`UPDATE ... WHERE status = $current`), concurrent requests can race past the action-layer guard.
- fix: Add `.eq("status", from)` to the update query (pass the expected `from` status from the action layer), or use a Supabase RPC with a `WHERE status = $1` clause.
- confidence: HIGH — standard TOCTOU race in optimistic-update patterns.

---

### [P2-MED] agentJobs.ts STATUS_TS map missing DISPUTED and CANCELLED timestamp columns

- file: apps/web/lib/repo/agentJobs.ts:107-112
- lens: web-DB vs on-chain divergence
- what: `STATUS_TS` maps `{FUNDED: "funded_at", STARTED: "started_at", DELIVERED: "delivered_at", CLOSED: "closed_at"}`. When `advanceJob(jobId, "DISPUTED")` is called, no timestamp column is set. The DB row has `status=DISPUTED` but no record of when it entered that state. On-chain, the `JobDisputed` event carries `block.timestamp`. This creates an audit-trail gap — the DB cannot answer "when was this job disputed?" without querying the chain.
- why: The `LEGAL_NEXT` map in the action layer allows STARTED→DISPUTED and DELIVERED→DISPUTED, but the repo layer silently drops the timestamp.
- fix: Add `DISPUTED: "disputed_at"` and `CANCELLED: "cancelled_at"` to `STATUS_TS` (requires a migration to add the columns if they don't exist).
- confidence: MEDIUM — functional correctness is unaffected but audit-trail completeness is broken.

---

### [P2-MED] Vendor disputes action uses mockGetAgentJob/mockGetStream for ownership check — bypassed in live mode

- file: apps/web/app/(wallet)/vendor/disputes/actions.ts:62-67
- lens: dispute-agent-fx / web-DB vs on-chain divergence
- what: The `openDisputeAction` ownership check for `context === "agent"` calls `mockGetAgentJob(contextRefId)` and for `context === "stream"` calls `mockGetStream(contextRefId)`. These are mock-store lookups that return in-memory data. In live mode (Supabase connected), the real agent jobs live in the `agent_jobs` table (via `agentJobsRepo.getJob`), but the dispute action still reads from the mock store. A vendor could open a dispute against an agent job that exists in the real DB but not in the mock store — the ownership check would fail with "contextRefId not found" even though the job is real. Conversely, if mock data is stale, a vendor could pass ownership checks against mock data that doesn't reflect real state.
- why: The cashout and invoice paths correctly use `getCashout` and `getInvoice` (which go through `tryDb()`), but agent and stream paths hardcode mock functions.
- fix: Replace `mockGetAgentJob` with `agentJobsRepo.getJob` and `mockGetStream` with the real stream repo lookup.
- confidence: HIGH — the code explicitly imports and calls mock functions for these two paths.

---

### [P2-MED] AgentBudgetWallet daily cap bypass via window-boundary timing

- file: packages/contracts/src/AgentBudgetWallet.sol:128-137
- lens: budget-cap enforcement
- what: The window rolls when `block.timestamp >= windowStart + WINDOW`. An agent can spend up to `dailyCapUsdc` in the last second of window N, then immediately spend another `dailyCapUsdc` in the first second of window N+1 (same block or next block). This allows `2 * dailyCapUsdc` to flow in a very short time period. While this is technically "correct" (two separate windows), it defeats the spirit of a daily cap for rate-limiting purposes.
- why: The window is a tumbling window, not a sliding window. Any tumbling-window cap has this boundary-doubling property.
- fix: Document as accepted risk OR implement a sliding window (more gas-expensive). For a testnet shim that will be replaced by Circle's spend policies on mainnet, this is likely acceptable.
- confidence: MEDIUM — it's a design trade-off, not a bug per se, but worth flagging for the mainnet replacement.

---

### [P2-MED] DisputeManager.decide allows PENALIZE_VENDOR for ad-hoc cases but no contract enforces the penalty

- file: packages/contracts/src/DisputeManager.sol:155-165
- lens: dispute-agent-fx / stranded intent
- what: For ad-hoc cases (`context == bytes32(0)`), any `Outcome` is allowed including `PENALIZE_VENDOR` and `MUTUAL_RESOLVED`. But no consumer contract listens for these outcomes on ad-hoc cases — the decision is recorded but has no fund-movement effect. The `VendorReputation` contract requires a trusted caller to explicitly call `record()` — it doesn't auto-react to DisputeManager events. If the operator decides PENALIZE_VENDOR on an ad-hoc case, the intent is recorded but never enforced.
- why: Ad-hoc cases have no escrow backing, so there's no fund to move. The penalty would need to be a reputation event, but that requires a separate `VendorReputation.record()` call that nothing automates.
- fix: Either restrict ad-hoc case outcomes to MUTUAL_RESOLVED only, or wire the daemon's Decided handler to call `VendorReputation.record()` when outcome is PENALIZE_VENDOR (with appropriate weight).
- confidence: MEDIUM — no funds at risk, but operator intent is silently dropped.

---

### [P3-LOW] VendorReputation._runningPerKind array is fixed at 12 but Kind enum could grow

- file: packages/contracts/src/VendorReputation.sol:52, 103
- lens: money-flow / correctness
- what: `_runningPerKind` is `int256[12]` and `record()` indexes it as `idx - 1` where `idx = uint8(kind)`. If the `Kind` enum grows beyond 12 entries, `idx - 1 >= 12` would write out-of-bounds in the fixed-size mapping value. Solidity's fixed-size array in a mapping doesn't revert on OOB — it writes to an adjacent storage slot (storage collision).
- why: The `KIND_COUNT` constant is 12 and matches the current enum, but there's no compile-time or runtime guard that prevents adding a 13th Kind without updating the array size.
- fix: Add a runtime check `require(idx - 1 < KIND_COUNT)` in `record()`, or use a dynamic structure. Alternatively, add a comment/test that fails if the enum grows.
- confidence: LOW — requires a code change to the enum without updating the array; unlikely but catastrophic if it happens.

---

### [P3-LOW] ReputationManager.computeScore amplified score can exceed 1000 for high-activity vendors

- file: packages/contracts/src/ReputationManager.sol:131-137
- lens: correctness
- what: The score formula is `base = amplified * 10; clamp to [0, 1000]`. With default multipliers (positive events at 1x, KYB at 3x), a vendor with 100 settled invoices (weight +1 each, multiplier 1x) gets `amplified = 100`, `base = 1000` — already at cap. The clamp works correctly, but the linear `* 10` scaling means any vendor past ~100 positive events is permanently at score 1000 (PRIORITY tier). The scoring formula has no diminishing returns, making the tier system meaningless for active vendors.
- why: Design issue, not a bug. The formula `amplified * 10` with clamp [0, 1000] saturates quickly. No funds at risk.
- fix: Use a logarithmic or sigmoid curve instead of linear scaling. Or adjust multipliers to be fractional (requires fixed-point math).
- confidence: LOW — no funds at risk; scoring accuracy issue only.

---

## Positive Observations

1. **DisputeManager state machine is well-enforced** — `decide()` requires `UNDER_REVIEW`, preventing skip-to-terminal attacks.
2. **AgentEscrow.resolveDispute derives `payToAgent` from on-chain outcome** — operator cannot override the contract's decision.
3. **Context-binding on dispute resolution** (WrongDisputeContext checks) prevents cross-escrow replay attacks across all three consumers.
4. **RetainerStream double-refund guard** — `StreamAlreadyCancelled` check in both `openDispute` and `resolveDispute` prevents the cancel→dispute→resolve double-drain.
5. **StableFXAdapterRegistry defense-in-depth slippage check** — registry re-validates adapter output, preventing buggy adapter from silently losing value.
6. **RoutePolicyEngine configured-corridor guard** — prevents accidental enablement of unconfigured corridors.
7. **Daemon idempotency via `claimOnce`** — event processing is correctly deduplicated by (txHash, logIndex).
8. **AgentEscrow hook wrapping in try/catch** — prevents malicious principal hooks from griefing agent transitions.
