# D8a — Invoice Settlement Money-Flow Audit

## Summary

Audited the full INVOICE → ACCEPT → PAY → SETTLE → RECEIPT pipeline across three layers: Solidity contracts (`InvoiceEscrow`, `AuditReceipt`, `FeeSplitter`), daemon event listener + workers (`arcSubscriber`, `screenAndSettle`, `receiptGenerate`), and web repo/actions. The contract layer is well-designed with strong state-machine enforcement and idempotency. Most findings are in the daemon↔DB layer where race conditions, non-atomic operations, and edge-case divergence from on-chain truth exist.

**Critical/High findings: 2 | Medium: 4 | Low: 3**

---

## Findings

### [HIGH] AuditReceipt.mint — receiptHash collision at tokenId 0 allows first-mint bypass

- file: packages/contracts/src/AuditReceipt.sol:79
- lens: money-flow/invoice
- what: The `AlreadyMinted` guard checks `receiptOf[receiptHash] != 0`. But `tokenId = uint256(receiptHash)`. If `receiptHash` happens to be `bytes32(0)` (astronomically unlikely but structurally unsound), `receiptOf[bytes32(0)]` would be set to `0`, and the guard would pass on a second mint attempt because `0 != 0` is false — wait, that's actually safe (0 == 0 is true, so it would revert). However, the REAL issue: for any legitimate receipt where `receiptHash != 0`, the first mint sets `receiptOf[receiptHash] = tokenId` (non-zero). But the `verify()` function at line 96 returns `receiptOf[receiptHash] != 0` — this means a receipt whose hash happens to produce `tokenId == 0` would verify as `false` even after minting. The hash `keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx))` producing exactly 0 is negligible probability, but the logic is structurally unsound.
- why: The contract conflates "not minted" with "tokenId == 0". A tokenId of 0 is a valid ERC-721 token but would be invisible to `verify()` and would allow a second `mint()` call (since `receiptOf[hash] == 0` passes the guard).
- fix: Use a separate `mapping(bytes32 => bool) public minted` flag, or store `tokenId + 1` in `receiptOf` and subtract 1 on read.
- confidence: medium (probability of keccak256 producing 0 is ~2^-256, but the structural flaw exists)

---

### [HIGH] Link paid_count increment is a read-then-write race condition

- file: apps/daemon/src/listener/arcSubscriber.ts:549-555
- lens: money-flow/invoice
- what: The `InvoiceSettled` handler reads `paid_count`, increments in JS, then writes back. Under concurrent settlements of invoices backed by the same link, two handlers read the same count and both write `count + 1`, losing one increment.
- why: No atomic SQL increment (e.g., `paid_count = paid_count + 1` via RPC or raw SQL). The same pattern exists in `lib/repo/links.ts:incrementLinkPaid` (line ~148) which acknowledges the race in a comment ("read-then-write is racy") but accepts it. The listener has no such acknowledgment and runs at higher concurrency (multiple events in the same poll batch).
- fix: Use a Supabase RPC that does `UPDATE payment_links SET paid_count = paid_count + 1 WHERE id = $1` atomically, or use a Redis-based counter with periodic flush.
- confidence: high

---

### [MEDIUM] FeeSplitter.distributeAdHoc called with memory array from InvoiceEscrow — ABI encoding overhead but no correctness issue

- file: packages/contracts/src/InvoiceEscrow.sol:416
- lens: money-flow/invoice
- what: `InvoiceEscrow.settle()` calls `feeSplitter.distributeAdHoc(inv.token, inv.amount, splits)` where `splits` is a `FeeSplitter.Split[] memory` array. The external call to `distributeAdHoc` expects `calldata`. Solidity handles this correctly (memory→calldata encoding happens at the external call boundary), but the `_readSplits` function copies from storage to memory, then the external call re-encodes to calldata — double copy. Not a correctness bug but gas-inefficient for large split arrays.
- why: No value-conservation issue; the FeeSplitter's dust-to-last-payee pattern ensures `sum(payouts) == amount`. However, the double-encoding increases gas cost proportionally to split count.
- fix: Consider passing the invoiceId to FeeSplitter and letting it read splits directly, or accept the gas overhead as acceptable for the typical 2-4 payee case.
- confidence: high (no money loss, gas inefficiency only)

---

### [MEDIUM] screenAndSettle worker persists `settled_tx_hash: paidTxHash` when on-chain branch is skipped in dev

- file: apps/daemon/src/workers/screenAndSettle.ts:148
- lens: money-flow/invoice
- what: When `settleTxHash` is null (dev/test mode, no wallet configured), the worker writes `settled_tx_hash: paidTxHash` to the invoices table. This means the DB records the buyer's payment tx as the settlement tx. If the `receipt-generate` worker later runs (e.g., triggered by a manual settle), it will use the wrong tx hash in the receipt anchor, causing the on-chain receipt's `settlementTx` field to mismatch the actual settle transaction.
- why: The receipt hash is `keccak256(abi.encode(invoiceId, acceptanceHash, settlementTx))`. Using `paidTxHash` instead of the real `settleTxHash` means the DB receipt hash won't match what the contract would produce if `settle()` were called later. This creates a permanent divergence between DB and chain state.
- fix: In dev mode, either don't flip to SETTLED at all (leave as PAID with a `simulated_settle` flag), or ensure the receipt-generate worker is also skipped. The current code already throws in production when wallet is missing, so this is dev-only — but it poisons the DB for any subsequent live-mode testing.
- confidence: high

---

### [MEDIUM] DB status update in InvoicePaid handler uses `.in("status", ["CREATED", "ACCEPTED"])` — misses edge case where invoice was never created in DB

- file: apps/daemon/src/listener/arcSubscriber.ts:262-270
- lens: money-flow/invoice
- what: The `InvoicePaid` handler updates the DB row with `.eq("id", ev.args.invoiceId).in("status", ["CREATED", "ACCEPTED"])`. If the invoice was created on-chain (via `createInvoiceFor` from a link relayer) but the DB insert failed or hasn't propagated yet, the update matches zero rows. The handler logs the error but continues to enqueue `screen-and-settle`. The screen worker then reads the invoice from DB, finds status != PAID, and may behave unexpectedly.
- why: The on-chain `acceptAndPay` succeeds (USDC is in escrow), but the DB never reflects PAID status. The `screen-and-settle` worker will still run screening and attempt to call `settle()` on-chain (which will succeed since on-chain status is PAID). But the DB row stays at CREATED/missing, causing the vendor dashboard to show stale state until the `InvoiceSettled` handler fires and reconciles from `["PAID", "ACCEPTED", "CREATED"]`.
- fix: The `InvoiceSettled` handler already reconciles from CREATED (line 520), so this is self-healing. However, there's a window where the vendor sees "Created" while money is in escrow. Consider an upsert or a reconciliation pass that creates missing DB rows from on-chain state.
- confidence: medium (self-healing via InvoiceSettled handler, but UX gap exists)

---

### [MEDIUM] Double-enqueue of receipt-generate from both screenAndSettle worker AND arcSubscriber InvoiceSettled handler

- file: apps/daemon/src/workers/screenAndSettle.ts:160 + apps/daemon/src/listener/arcSubscriber.ts:558
- lens: money-flow/invoice
- what: Both the `screenAndSettle` worker (after calling `settle()` on-chain) and the `arcSubscriber` `InvoiceSettled` handler enqueue a `receipt-generate` job. They use the same `jobId: receipt-generate_${invoiceId}` so BullMQ deduplicates them. However, the `screenAndSettle` worker passes `screeningHash` in the job data while the listener does NOT. If the listener's enqueue wins the race (arrives first), the receipt worker won't have `screeningHash` in `job.data` — but the worker reads it from `screening_results` table anyway (line 56-66 of receiptGenerate.ts), so this is safe.
- why: The dedup via jobId is correct. The data divergence (screeningHash present vs absent) is harmless because the worker re-derives it from DB. No money-flow issue.
- fix: No fix needed — this is defense-in-depth working correctly. Document the intentional dual-enqueue pattern.
- confidence: high (confirmed safe)

---

### [LOW] EIP-712 acceptance signature has no expiry/deadline — signed acceptance is valid forever

- file: packages/contracts/src/InvoiceEscrow.sol:57-60
- lens: money-flow/invoice
- what: The `ACCEPTANCE_TYPEHASH` includes `invoiceId, vendor, token, amount, dueAt, metadataHash, splitsHash` but no `deadline` or `nonce` field. Once a buyer signs an acceptance, that signature is valid until the invoice is paid or cancelled. If the buyer changes their mind, they cannot revoke the signature — anyone holding it can call `acceptAndPay` at any time (provided they also transfer the buyer's USDC, which requires a prior `approve`).
- why: The practical risk is low because `acceptAndPay` requires `safeTransferFrom(buyer, ...)` which needs an active ERC-20 approval. If the buyer revokes their USDC approval, the signature becomes unusable. However, if the buyer has a standing Permit2 or infinite approval, a stale signature could be replayed after the buyer intended to withdraw.
- fix: Add a `uint64 deadline` field to the acceptance typehash so signatures expire. The `dueAt` field is "informational, no auto-revert" per the contract comments, so it doesn't serve as a deadline.
- confidence: medium (mitigated by approval requirement, but structurally incomplete)

---

### [LOW] AuditReceipt.mint is not pause-gated — operator can mint receipts even during emergency pause of InvoiceEscrow

- file: packages/contracts/src/AuditReceipt.sol:74
- lens: money-flow/invoice
- what: `AuditReceipt` has no `Pausable` inheritance. The `mint()` function is `onlyOperator` but has no pause gate. If `InvoiceEscrow` is paused due to an exploit, the daemon's `receiptGenerate` worker could still mint receipts for settlements that occurred before the pause, or for settlements that shouldn't have happened.
- why: During an incident, the operator may want to freeze ALL downstream effects of a potentially-invalid settlement. Without a pause on AuditReceipt, receipts for fraudulent settlements could be minted and shared before the operator can intervene.
- fix: Add `Pausable` to `AuditReceipt` with an owner-controlled pause, or have the daemon check InvoiceEscrow's paused state before calling mint.
- confidence: medium

---

### [LOW] receiptGenerate worker uses `Date.now()` for `settledAt` instead of the actual block timestamp

- file: apps/daemon/src/workers/receiptGenerate.ts:95
- lens: money-flow/invoice
- what: The `anchor.settledAt` field is set to `BigInt(Math.floor(Date.now() / 1000))` — the daemon's wall-clock time when the worker runs, not the actual block timestamp of the `settle()` transaction. If the worker is delayed (queue backlog, daemon restart), the receipt's `settledAt` will diverge from the actual on-chain settlement time.
- why: The `AuditReceipt.Anchor.settledAt` is meant to record when settlement occurred. Using daemon wall-clock instead of `block.timestamp` from the settle tx receipt means the on-chain receipt anchor has an inaccurate timestamp. This affects audit accuracy but not money flow.
- fix: Fetch the block timestamp from the settlement transaction receipt (`rcpt.blockNumber` → `getBlock(blockNumber).timestamp`) and use that as `settledAt`.
- confidence: high

---

## Contract State Machine Assessment

The `InvoiceEscrow` state machine is sound:
- **NONE → CREATED**: `createInvoice*` checks `status != NONE` → reverts `AlreadyExists` ✓
- **CREATED → PAID**: `acceptAndPay` checks `status == CREATED` ✓ (skips ACCEPTED as a logical intermediate)
- **PAID → SETTLED**: `settle` checks `status == PAID` + `screeningHash != 0` ✓
- **PAID → REFUNDED**: `refund` checks `status == PAID` + `acceptedBy != 0` ✓
- **CREATED/ACCEPTED → CANCELLED**: `cancelInvoice` checks `status == CREATED || ACCEPTED` ✓

**Double-settle protection**: `settle()` transitions to SETTLED first, then moves funds. A second call reverts with `InvalidStatus(PAID, SETTLED)`. ✓

**Double-pay protection**: `acceptAndPay()` checks `status == CREATED`. After first call, status is PAID. Second call reverts. ✓

**Value conservation**: In the sole-vendor path, `safeTransfer(vendor, inv.amount)` — full amount, no fee deduction at this layer. In the splits path, `FeeSplitter.distributeAdHoc` enforces `sum(bps) == 10_000` and dust goes to last payee. ✓

**Reentrancy**: All fund-moving functions have `nonReentrant`. ✓

**Replay of EIP-712 signatures**: The acceptance signature is bound to a specific `invoiceId`. Since `acceptAndPay` transitions the invoice to PAID, the same signature cannot be replayed (the status check would fail). ✓ The `LinkInvoiceAuthorization` is bound to `linkId` + `authDeadline` and the invoice creation checks `AlreadyExists`. ✓
