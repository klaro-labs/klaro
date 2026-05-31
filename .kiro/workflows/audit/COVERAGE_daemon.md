# Daemon Test-Coverage Audit

> Generated: 2026-05-31 · Auditor: daemon_coverage subagent
> Scope: `apps/daemon/src/` — 15 workers + 1 listener (arcSubscriber)

---

## Summary Table

| Worker / Handler | Tested? | Moves Money? | Priority |
|---|---|---|---|
| `cashoutAdvancer` | ❌ NO | ✅ YES — signs `claimByLP`, `recordProof`, `operatorConfirmReceived` (releases USDC from escrow → LP) | **P0** |
| `screenAndSettle` | ❌ NO | ✅ YES — signs `recordScreening` + `settle` (releases USDC from escrow → vendor) | **P0** |
| `disputeResolver` | ❌ NO (routing policy only) | ✅ YES — signs `resolveDispute` on AgentEscrow / CashoutOrderProcessor / RetainerStream | **P0** |
| `receiptGenerate` | ❌ NO | ⚠️ Indirect — signs `AuditReceipt.mint()` (no USDC move, but receipt is the audit anchor) | **P0** |
| `arcSubscriber` (InvoicePaid) | ❌ NO | ⚠️ Indirect — gates the screen-and-settle pipeline; DB sync of PAID status | **P0** |
| `arcSubscriber` (Decided) | ❌ NO | ✅ YES — DB mirror of dispute outcome + fans out to `disputeResolver` | **P0** |
| `arcSubscriber` (JobCompleted) | ❌ NO | ⚠️ Indirect — DB mirror of agent job closure (CLOSED status) | **P1** |
| `webhookDelivery` | ❌ NO | ❌ No — but SSRF + HMAC integrity; data exfil risk | **P1** |
| `proofVerifier` | ❌ NO | ⚠️ Indirect — gates cashout proof-verify leg; wrong state blocks USDC release | **P1** |
| `notifications` | ❌ NO | ❌ No — but silent drops = vendor/LP never learns money moved | **P1** |
| `_dlq` | ❌ NO | ❌ No — but failure here = no operator visibility on stuck money | **P1** |
| `adminRisk` | ❌ NO | ⚠️ Indirect — re-enqueues stuck screen-and-settle (money path) | **P2** |
| `erpSync` | ❌ NO | ❌ No — accounting sync only | **P2** |
| `lifecycleReminders` | ❌ NO | ❌ No — notification cron | **P3** |
| `kpiAggregator` | ❌ NO | ❌ No — internal metrics | **P3** |
| `sanctionsRefresh` | ❌ NO | ❌ No — simulated stub | **P3** |
| `stableFxAdapter` | ❌ NO | ❌ No — simulated stub | **P3** |
| `disputeRouting` (pure fn) | ✅ YES | ❌ No — pure policy | — |
| `redis.claimOnce` | ✅ YES | ❌ No — dedup primitive | — |
| `redis.releaseClaimBounded` | ✅ YES | ❌ No — retry primitive | — |

**Existing tests cover:** Redis dedup primitives (`claimOnce`, `releaseClaim`, `releaseClaimBounded`, `clearRetryCounter`) and the pure `planDisputeResolution` routing policy. **Zero worker process functions or listener event handlers are tested.**

---

## P0 Gaps — Money Movers (Must Test Before Mainnet)

---

### [P0] cashoutAdvancer — untested

- **path:** `apps/daemon/src/workers/cashoutAdvancer.ts:155-280` (all 4 branches)
- **responsibility:** Advances cashout orders through the on-chain state machine: `match-lp` (LOCKED→CLAIMED via `claimByLP`), `proof-verify` (CLAIMED→PROOF_SUBMITTED via `recordProof`), `release` (PROOF_SUBMITTED→RELEASED via `operatorConfirmReceived` — **moves USDC from escrow to LP wallet**), `expire-quote` (DB-only status flip).
- **risk if it breaks:**
  - `match-lp`: DB records LP assignment the chain doesn't hold → proof-verify reverts → vendor USDC stranded in escrow indefinitely.
  - `proof-verify`: On-chain order stays CLAIMED → release leg reverts `InvalidStatus` → DLQ → vendor USDC stranded.
  - `release`: `operatorConfirmReceived` fails silently → DB says RELEASED but USDC stays in escrow → LP never gets paid → trust collapse.
  - `expire-quote`: Benign (DB-only), but wrong status guard could expire a CLAIMED order.
- **test to add:**
  ```
  Harness: mock `arcPublic()` (viem public client) + `arcWallet()` (wallet client) + `sb()` (Supabase).
  
  1. Unit-test `advanceClaimOnChain`:
     - on-chain LOCKED → calls writeContract(claimByLP) → returns preferredLpId
     - on-chain CLAIMED → returns on-chain lpId (idempotent)
     - on-chain NONE → returns preferredLpId (legacy skip)
     - on-chain other status → throws
  
  2. Unit-test `advanceProofOnChain`:
     - on-chain CLAIMED → calls writeContract(recordProof) with correct struct
     - on-chain PROOF_SUBMITTED → no-op (idempotent)
     - on-chain NONE → no-op (legacy)
  
  3. Integration-test the full worker via BullMQ test harness:
     - `match-lp`: mock LP query → assert claimByLP called → assert DB update → assert notify-vendor enqueued
     - `release`: mock getOrder → assert operatorConfirmReceived called with correct vendor_wallet → assert DB RELEASED → assert notify-lp enqueued
     - `release` idempotent: row already RELEASED → early return, no chain call
     - `release` missing vendor_wallet → throws (not silent skip)
  ```

---

### [P0] screenAndSettle — untested

- **path:** `apps/daemon/src/workers/screenAndSettle.ts:60-175`
- **responsibility:** Runs 3-of-3 sanctions/behavioral/KYB screening on a paid invoice, then (on all-pass) signs `recordScreening` + `settle` on InvoiceEscrow — **releasing USDC from escrow to vendor**. On fail/review, flags for admin.
- **risk if it breaks:**
  - `settle()` called without `recordScreening` → contract reverts → DB flipped to SETTLED while USDC locked → **money divergence**.
  - DB flipped to SETTLED before chain tx confirmed → crash between DB write and chain → vendor sees "settled" but USDC stuck.
  - Screening upsert fails silently → no audit trail → compliance violation.
  - `requires_admin_review` not set on fail → vendor sees "paid" forever with no honest surface.
- **test to add:**
  ```
  Harness: mock arcWallet/arcPublic/sb.
  
  1. All-review path (current default): assert screening_results upserted, notify-admin enqueued, NO settle call, NO DB status change to SETTLED.
  2. All-pass path (future): assert recordScreening called FIRST, then settle called, then DB flipped to SETTLED with settleTxHash, then receipt-generate + erp-sync + notify-vendor enqueued.
  3. Fail path: assert requires_admin_review=true, notify-admin enqueued with kind="screening.fail".
  4. Chain call failure: assert worker throws (BullMQ retries), DB NOT flipped to SETTLED.
  5. Missing INVOICE_ESCROW_ADDRESS in prod: assert throws (fail-loud).
  6. Idempotent upsert: call twice with same invoiceId → no duplicate screening_results rows.
  ```

---

### [P0] disputeResolver — untested (only routing policy tested)

- **path:** `apps/daemon/src/workers/disputeResolver.ts:100-180` (`advanceDisputeResolution`)
- **responsibility:** After `Decided` event, routes to the correct escrow's `resolveDispute` and signs it — **moves USDC** (refund to claimant, release to respondent, or slash LP stake).
- **risk if it breaks:**
  - Wrong `payToAgent` derivation → agent gets paid when principal should, or vice versa.
  - Simulate-then-write skips a transient error as "revert" → funds stuck in escrow forever.
  - Missing address config in prod → decided disputes never resolve → funds locked.
- **test to add:**
  ```
  Harness: mock arcPublic (readContract for getCase/jobs), arcWallet (simulateContract + writeContract), sb.
  
  1. Agent RELEASE_TO_CLAIMANT where claimant==agent → payToAgent=true → assert resolveDispute(jobId, true) called.
  2. Agent REFUND_TO_RESPONDENT where claimant==agent → payToAgent=false → assert resolveDispute(jobId, false).
  3. Cashout RELEASE_TO_CLAIMANT → assert resolveDispute(cashoutId, 0, reasonHash) called.
  4. Stream → assert resolveDispute(streamId) called.
  5. SLASH_LP → assert notify-admin enqueued (manual), NO chain call.
  6. MUTUAL_RESOLVED → assert skip, NO chain call.
  7. Simulate reverts (already resolved) → assert no writeContract, no throw (idempotent skip).
  8. Simulate throws non-revert (RPC error) → assert rethrow for BullMQ retry.
  9. isContractRevert correctly distinguishes BaseError+ContractFunctionRevertedError from generic Error.
  ```

---

### [P0] receiptGenerate — untested

- **path:** `apps/daemon/src/workers/receiptGenerate.ts:45-155`
- **responsibility:** Calls `AuditReceipt.mint()` on-chain, extracts the contract-derived `receiptHash` from the ReceiptMinted event log, persists to `receipts` table + updates `invoices.receipt_hash`. The receipt is the **audit-grade proof** that settlement happened.
- **risk if it breaks:**
  - `mint()` reverts but worker doesn't throw → no receipt exists → "Verified on Arc" claim is false.
  - Event log decoding fails + fallback hash differs from contract's → `verify(hash)` returns false → receipt appears invalid.
  - `vendors!inner(wallet)` join returns array but code expects object → vendor=undefined → throws on every receipt.
  - Missing `AUDIT_RECEIPT_ADDRESS` → throws (correct), but no test confirms this.
- **test to add:**
  ```
  Harness: mock arcPublic (waitForTransactionReceipt returns logs with ReceiptMinted), requireArcWalletInProd (returns mock wallet), sb.
  
  1. Happy path: mock mint tx + receipt with ReceiptMinted log → assert receipts upserted with contract-derived hash → assert invoices.receipt_hash updated.
  2. No ReceiptMinted in logs (reorg edge): assert fallback keccak256 computation matches expected.
  3. Mint tx reverts (rcpt.status !== "success") → assert throws.
  4. Invoice not found → assert throws.
  5. Vendor wallet missing → assert throws with clear message.
  6. PostgREST vendors join returns array vs object → assert correct unwrap.
  ```

---

### [P0] arcSubscriber — InvoicePaid handler — untested

- **path:** `apps/daemon/src/listener/arcSubscriber.ts:195-250`
- **responsibility:** On `InvoicePaid` event: decodes buyer's EIP-712 acceptance signature from calldata, syncs DB status CREATED→PAID, enqueues `screen-and-settle`. This is the **entry point** for the entire settlement pipeline.
- **risk if it breaks:**
  - DB never flips to PAID → vendor dashboard shows "Created" forever despite on-chain payment.
  - `screen-and-settle` never enqueued → USDC sits in escrow indefinitely with no screening.
  - Signature capture fails + throws (instead of non-fatal) → entire handler aborts → screen job never fires.
  - `claimOnce` dedup key wrong → duplicate screen-and-settle jobs → duplicate screening_results rows (pre-upsert fix) or wasted work.
- **test to add:**
  ```
  Harness: mock arcPublic (getLogs returns synthetic InvoicePaid logs, getTransaction returns encoded acceptAndPay calldata), redis (claimOnce), queue (screen-and-settle), sb.
  
  1. First InvoicePaid log → claimOnce returns true → DB updated to PAID → screen-and-settle enqueued with correct payload.
  2. Duplicate log (same txHash:logIndex) → claimOnce returns false → no DB write, no enqueue.
  3. getTransaction fails (sig capture) → handler continues → screen-and-settle still enqueued (non-fatal).
  4. DB update fails → handler continues → screen-and-settle still enqueued (best-effort).
  5. Invoice already in SETTLED status → `.in("status", ["CREATED","ACCEPTED"])` guard → 0 rows affected (no clobber).
  ```

---

### [P0] arcSubscriber — Decided handler — untested

- **path:** `apps/daemon/src/listener/arcSubscriber.ts:430-480`
- **responsibility:** On `Decided` event: mirrors dispute outcome to DB (`disputes.status=DECIDED`, `outcome`, `decided_at`), enqueues `notify-admin`, fans out to `dispute-resolve` queue (which triggers `disputeResolver` → moves money).
- **risk if it breaks:**
  - DB never mirrors outcome → operator UI shows "OPEN" forever → manual resolution impossible.
  - `dispute-resolve` never enqueued → decided dispute never executes on escrow → funds locked.
  - Outcome enum mapping wrong (e.g., `1` maps to wrong string) → DB records wrong outcome → operator makes wrong manual decision.
- **test to add:**
  ```
  Harness: same as InvoicePaid handler test.
  
  1. Decided event with outcome=1 → DB updated with outcome="RELEASE_TO_CLAIMANT" + status="DECIDED" → notify-admin enqueued → dispute-resolve enqueued.
  2. Decided event with outcome=5 → outcome="MUTUAL_RESOLVED".
  3. DB sync fails → handler continues → notify-admin + dispute-resolve still enqueued.
  4. Duplicate event → claimOnce blocks → no double-enqueue.
  5. Unknown outcome (e.g., 99) → outcome field omitted from update (no crash).
  ```

---

## P1 Gaps — Integrity / Security / Operator Visibility

---

### [P1] webhookDelivery — untested

- **path:** `apps/daemon/src/workers/webhookDelivery.ts:75-200`
- **responsibility:** HMAC-signs outbound webhook payloads, delivers to subscriber URLs with SSRF protection (`assertPublicHttpUrl` + `redirect: "manual"`), records delivery audit trail, honors 429 Retry-After.
- **risk if it breaks:**
  - SSRF bypass: `assertPublicHttpUrl` not called or redirect followed → daemon reaches AWS IMDS / internal services with signed Klaro body.
  - HMAC computed wrong → subscriber rejects all deliveries → integration broken.
  - `deliveryIdempotencyKey` collision → audit trail overwrites unrelated delivery.
  - 429 handling wrong → BullMQ DLQs after 5 fast retries → subscriber never gets event.
  - Missing `payload_json` → NOT NULL violation → every delivery DLQs silently.
- **test to add:**
  ```
  Harness: mock fetch (global), sb, env.WEBHOOK_HMAC_SECRET.
  
  1. Happy path: fetch returns 200 → webhook_deliveries upserted with status="success".
  2. SSRF: assertPublicHttpUrl throws → worker throws (no fetch called).
  3. Redirect (302) → assert throws with "SSRF guard" message, no follow.
  4. 429 with Retry-After: 60 → assert job.moveToDelayed called with 60000ms, throws DelayedError.
  5. 500 response → assert webhook_deliveries upserted with status="failed" + last_error includes body.
  6. Missing WEBHOOK_HMAC_SECRET → assert throws "fail-closed".
  7. HMAC signature verification: compute expected sig, assert header matches.
  8. deliveryIdempotencyKey: assert deterministic + distinct for different (webhookId, eventId) pairs.
  ```

---

### [P1] proofVerifier — untested

- **path:** `apps/daemon/src/workers/proofVerifier.ts:20-50`
- **responsibility:** Marks submitted payout proofs as `simulated: true` (no live verifier yet), enqueues admin review. Guards against overwriting manually-verified proofs.
- **risk if it breaks:**
  - Missing `.is("verified_at", null)` guard → admin-verified proof gets un-verified → cashout loops forever.
  - notify-admin not enqueued → proof sits unreviewed → vendor USDC stuck.
- **test to add:**
  ```
  Harness: mock sb.
  
  1. Normal: proof not yet verified → update sets simulated=true → notify-admin enqueued.
  2. Already verified (verified_at != null) → update affects 0 rows (PostgREST) → notify-admin still enqueued (admin sees it, no harm).
  3. DB update fails → throws for BullMQ retry.
  ```

---

### [P1] arcSubscriber — JobCompleted handler — untested

- **path:** `apps/daemon/src/listener/arcSubscriber.ts:385-415`
- **responsibility:** Mirrors agent job closure to DB (`agent_jobs.status=CLOSED`), enqueues vendor notification.
- **risk if it breaks:**
  - DB never flips to CLOSED → vendor UI shows "In Progress" forever → vendor can't see deliverable.
  - Wrong column lookup (`job_id` vs `id`) → update matches nothing → silent no-op.
- **test to add:**
  ```
  1. JobCompleted event → DB updated to CLOSED + closed_at set → notify-vendor enqueued with kind="agent.job.completed".
  2. DB update fails → error logged but notify-vendor still enqueued.
  ```

---

### [P1] notifications — untested

- **path:** `apps/daemon/src/workers/notifications.ts:1-280`
- **responsibility:** Dispatches emails to vendors, buyers, LPs, admins based on `kind`. Resolves recipients via DB lookups (vendor_id, invoiceId→vendor, orderId→vendor, jobId→vendor, invoiceId→buyer, orderId→lp).
- **risk if it breaks:**
  - Recipient resolution fails silently → vendor/LP/buyer never learns money moved → support tickets.
  - Unknown `kind` → returns null → `notify.unhandled_kind` warn but job succeeds → silent drop.
  - `emailLp` orderId→lp_id resolution wrong → LP never gets "released" email.
- **test to add:**
  ```
  Harness: mock sb, Resend (or env without RESEND_API_KEY for mock path).
  
  1. notify-vendor with vendorId → emailVendor called with correct subject per kind.
  2. notify-vendor with invoiceId (no vendorId) → resolves via invoices.vendor_id.
  3. notify-vendor with orderId → resolves via cashout_orders.vendor_id.
  4. notify-vendor with jobId → resolves via agent_jobs.vendor_id (using job_id column).
  5. notify-buyer with invoiceId → resolves via invoices.customer_email.
  6. notify-lp with orderId → resolves via cashout_orders.lp_id → lp_profiles.contact_email.
  7. Unknown kind → returns null → job completes (no throw), warn logged.
  8. Missing email → warn logged, no throw.
  ```

---

### [P1] _dlq — untested

- **path:** `apps/daemon/src/workers/_dlq.ts:1-200`
- **responsibility:** Persists failed jobs to `dead_letter_jobs` table, fires PagerDuty when backlog exceeds threshold. Cross-replica Redis-lock cooldown.
- **risk if it breaks:**
  - `persist()` fails → failed jobs vanish with no operator visibility → money-moving workers silently drop.
  - PagerDuty never fires → operator unaware of DLQ storm during incident.
  - `stopDlqWatch()` doesn't drain → shutdown race → ECONNRESET spam.
- **test to add:**
  ```
  1. persist(): mock sb + queue().getJob → assert dead_letter_jobs row inserted with payload.
  2. checkBacklog(): mock sb count ≥ threshold → assert firePagerDuty called.
  3. PagerDuty cooldown: second call within 30min → assert no fetch.
  4. stopDlqWatch(): assert QueueEvents closed + interval cleared.
  ```

---

## P2 Gaps — Operational / Compliance

---

### [P2] adminRisk — untested

- **path:** `apps/daemon/src/workers/adminRisk.ts:15-85`
- **responsibility:** Hourly scan for SLA-breaching disputes (24h), stuck cashouts (2h PROOF_SUBMITTED), and unscreened invoices (30min PAID without screening_results). Re-enqueues screen-and-settle for unscreened.
- **risk if it breaks:**
  - Unscreened invoices never re-enqueued → USDC stuck in escrow after listener miss.
  - Missing soft-delete filter → voided rows re-enqueue forever (enqueue bomb).
- **test to add:**
  ```
  1. Dispute past 24h SLA → notify-admin enqueued.
  2. Cashout stuck 2h in PROOF_SUBMITTED → notify-admin enqueued.
  3. Invoice PAID 30min without screening_results → screen-and-settle re-enqueued with correct payload.
  4. Soft-deleted rows excluded from all three queries.
  5. PostgREST error → throws (BullMQ retry).
  ```

---

### [P2] erpSync — untested

- **path:** `apps/daemon/src/workers/erpSync.ts:50-140`
- **responsibility:** Resolves vendor's ERP connections, writes `erp_sync_jobs` audit rows, calls provider push (currently simulated).
- **risk if it breaks:**
  - Idempotency key collision → overwrites unrelated sync job.
  - Missing `payload_json` → NOT NULL violation → every sync DLQs.
  - No vendor ERP connections → should no-op cleanly (not throw).
- **test to add:**
  ```
  1. Vendor with 2 ERP connections → 2 erp_sync_jobs rows created.
  2. Retry (existing row status="failed") → upsert increments attempts.
  3. Already success → skipped.
  4. No connections → clean return, no throw.
  5. Invoice not found → warn + return.
  ```

---

## P3 Gaps — Low Risk / Stubs

---

### [P3] lifecycleReminders — untested

- **path:** `apps/daemon/src/workers/lifecycleReminders.ts:25-55`
- **responsibility:** Hourly cron finds invoices crossing due-date windows, enqueues notify-buyer.
- **risk if it breaks:** Buyers don't get reminders. No money impact.
- **test to add:** Unit-test window matching logic (daysOut calculation + WINDOWS array hit detection).

---

### [P3] kpiAggregator — untested

- **path:** `apps/daemon/src/workers/kpiAggregator.ts:15-80`
- **responsibility:** Materializes KPI rollups to `kpi_snapshots`.
- **risk if it breaks:** Internal dashboard shows stale/zero metrics. No money impact.
- **test to add:** Assert bucket calculation (hour/day/week alignment) + upsert idempotency.

---

### [P3] sanctionsRefresh — untested

- **path:** `apps/daemon/src/workers/sanctionsRefresh.ts:10-35`
- **responsibility:** Simulated stub — logs intent, writes audit row.
- **risk if it breaks:** None currently (simulated). Will matter at M5 when real lists are fetched.
- **test to add:** Assert audit row written; assert graceful handling when table doesn't exist.

---

### [P3] stableFxAdapter — untested

- **path:** `apps/daemon/src/workers/stableFxAdapter.ts:15-25`
- **responsibility:** Simulated stub — logs FX execution intent.
- **risk if it breaks:** None currently (simulated).
- **test to add:** Assert worker starts and processes job without throw.

---

## Recommended Test Infrastructure

All workers follow the same pattern (`startWorker<T>(queueName, handler, concurrency)`). A shared test harness should:

1. **Mock `../db.js`** → return a chainable Supabase mock (e.g., `vitest-mock-supabase` or manual builder).
2. **Mock `../arc.js`** → return mock `arcPublic()` (viem public client with `readContract`, `waitForTransactionReceipt`, `getBlockNumber`, `getLogs`, `getTransaction`) and `arcWallet()` (with `writeContract`).
3. **Mock `../queue.js`** → capture `queue(name).add(...)` calls for assertion.
4. **Mock `../redis.js`** → in-memory Redis (already exists in test files).
5. **Extract handler functions** from `startWorker` calls (some workers like `cashoutAdvancer` already export helpers; others need the handler extracted or the worker invoked via BullMQ's test utilities).

Priority order for implementation: `screenAndSettle` → `cashoutAdvancer` → `arcSubscriber` (InvoicePaid + Decided) → `disputeResolver` → `receiptGenerate` → `webhookDelivery`.

---

## Key Metrics

- **Workers with zero test coverage:** 15/15 (the 3 existing test files cover Redis primitives and a pure routing function, not worker process logic)
- **Money-moving workers untested:** 4 (`cashoutAdvancer`, `screenAndSettle`, `disputeResolver`, `receiptGenerate`)
- **Listener event handlers untested:** 10/10 (InvoicePaid, InvoiceSettled, InvoiceRefunded, OrderClaimed, ProofSubmitted, OrderReleased, JobCompleted, ReceiptMinted, CaseOpened, Decided)
- **Lines of untested money-moving code:** ~750 (cashoutAdvancer: 280, screenAndSettle: 175, disputeResolver: 180, receiptGenerate: 115)
