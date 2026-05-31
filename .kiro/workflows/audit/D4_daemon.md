# D4 — Daemon Audit: Event-Handling, Idempotency, Workers, Observability

**Auditor**: d4_daemon  
**Date**: 2026-05-31  
**Scope**: `apps/daemon/src/**` — arcSubscriber, all workers, queue, redis, env, db, safeFetchUrl, abiAssert  
**Verdict**: The daemon is well-hardened after many QA iterations. Remaining findings are medium/low severity — no critical money-loss paths remain open, but several robustness and correctness gaps persist.

---

## Summary

| SEV | Count | Theme |
|-----|-------|-------|
| HIGH | 2 | Race in paid_count increment; Decided DB write throws but doesn't release claim |
| MEDIUM | 6 | claimOnce TTL vs cursor gap; DLQ `prev` filter; notify-vendor missing jobId dedup; screenAndSettle simulated-always; shutdown unhandledRejection; InvoiceRefunded missing jobId |
| LOW | 5 | Observability gaps; minor correctness nits |

---

## Findings

### [HIGH] Payment-link `paid_count` increment is non-atomic read-then-write race

- file: `apps/daemon/src/listener/arcSubscriber.ts:290-302`
- lens: daemon
- what: The InvoiceSettled handler reads `payment_links.paid_count`, increments in JS, then writes back. Two concurrent settlements for the same link (e.g. two invoices from the same payment link settling in the same poll batch) will read the same count and both write `count + 1`, losing one increment.
- why: Classic lost-update race. `safeEvent` processes events sequentially within a batch, but two batches from different poll ticks (or two daemon replicas) can overlap. The counter drifts permanently — payment links with `max_uses` will allow one extra payment before closing.
- fix: Use Supabase RPC with `UPDATE payment_links SET paid_count = paid_count + 1 WHERE id = $1` (atomic server-side increment), or use `.rpc('increment_paid_count', { link_id })`.
- confidence: high

---

### [HIGH] Decided handler `throw error` inside safeEvent leaves claim held with no admin escalation path

- file: `apps/daemon/src/listener/arcSubscriber.ts:476`
- lens: daemon
- what: In the `Decided` event handler, the DB update failure does `if (error) throw error`. This throw is caught by `safeEvent`'s catch block which calls `releaseClaimBounded`. However, if the DB write fails on ALL 5 retries (e.g. column mismatch, RLS issue), the claim is held permanently AND the `notify-admin` enqueue at line 480 never executes (it's after the throw). The `safeEvent` catch does escalate to admin after 5 retries, but the escalation payload says `listener.retry_exhausted` — it doesn't carry the dispute's `caseId` or `outcome`, making operator replay harder.
- why: The throw prevents the notify-admin enqueue from running. The bounded-release escalation is generic. If the DB schema drifts (e.g. `decision_reason_hash` column renamed), every Decided event is permanently lost with only a generic admin page.
- fix: Move the `notify-admin` enqueue BEFORE the throw, or restructure so the admin notification fires regardless of DB write success. Alternatively, include `caseId` + `outcome` in the `safeEvent` error context so the escalation payload is actionable.
- confidence: high

---

### [MED] claimOnce TTL (24h) vs cursor persistence creates a dedup gap on long downtime

- file: `apps/daemon/src/redis.ts:62` + `apps/daemon/src/listener/arcSubscriber.ts:230-240`
- lens: daemon
- what: `claimOnce` keys expire after 86,400 seconds (24h). The cursor is persisted to Redis and on restart the daemon replays from the last persisted cursor. If the daemon is down for >24h, the cursor resumes from 24h+ ago, but all `claimOnce` keys from that era have expired. Events that were successfully processed before the downtime will be re-processed (duplicate DB writes, duplicate notifications, duplicate on-chain txs in workers like screenAndSettle).
- why: The dedup window (24h) is shorter than the theoretical replay window (unbounded). In practice, >24h downtime is rare but not impossible (failed deploy, stuck rollback). The DB writes are mostly idempotent (upserts, status guards), but `queue.add` with deterministic jobId will be deduplicated by BullMQ only if the original job hasn't been cleaned (removeOnComplete age: 24h). So after 24h downtime, both dedup layers expire simultaneously.
- fix: Either (a) cap the cursor replay to `max(persisted_cursor, latest - 24h_of_blocks)` so the replay window never exceeds the dedup window, or (b) extend claimOnce TTL to 7d (matching removeOnFail retention).
- confidence: medium

---

### [MED] DLQ `prev` filter may miss final failures

- file: `apps/daemon/src/workers/_dlq.ts:42`
- lens: daemon
- what: The DLQ handler filters `if (prev && prev !== "active") return;` to only handle the FINAL failure. However, BullMQ's QueueEvents `failed` event emits `prev` as the previous state. When a job exhausts all attempts, `prev` is `"active"` (it was active, then failed). But if a job is moved to failed from `delayed` (e.g. via `moveToFailed` in custom logic or a stalled job), `prev` could be `"delayed"` or `"waiting"` — these would be filtered out and never persisted to the DLQ table.
- why: Stalled jobs (worker crash mid-processing) are moved to failed by BullMQ's stalled-job checker. The `prev` state for a stalled job's final failure is implementation-dependent and may not be `"active"`.
- fix: Check `job.attemptsMade >= job.opts.attempts` instead of relying on `prev`, or remove the `prev` filter entirely and deduplicate via upsert on `(queue_name, job_id)`.
- confidence: medium

---

### [MED] InvoiceRefunded handler missing deterministic jobId on notify-vendor and notify-buyer

- file: `apps/daemon/src/listener/arcSubscriber.ts:316-322`
- lens: daemon
- what: Both `queue("notify-vendor").add(...)` and `queue("notify-buyer").add(...)` in the InvoiceRefunded handler omit `{ jobId: ... }` in the options. Every other handler in the file uses deterministic jobIds for dedup. If the `safeEvent` catch releases the claim and the event re-fires, or if a second daemon replica processes the same event before claimOnce propagates, duplicate notification jobs will be enqueued.
- why: The `claimOnce` + `safeEvent` retry mechanism can release the claim on transient failure. Without a deterministic jobId, BullMQ cannot deduplicate the re-enqueue. Vendor and buyer receive duplicate "refunded" emails.
- fix: Add `{ jobId: \`notify-vendor_refunded_\${ev.args.invoiceId}\` }` and `{ jobId: \`notify-buyer_refunded_\${ev.args.invoiceId}\` }`.
- confidence: high

---

### [MED] screenAndSettle always returns "review" — settlement path is dead code in production

- file: `apps/daemon/src/workers/screenAndSettle.ts:52-72`
- lens: daemon
- what: `runScreen()` unconditionally returns `result: "review"` for all 3 providers. The `results.some(r => r.result === "review")` branch fires, enqueues `notify-admin`, and returns. The entire settlement path (lines 100-180) is unreachable. This is documented as intentional (`[SIMULATED]`), but the honest-mode label is only in the log detail string — the invoice status stays `PAID` forever with `requires_admin_review` never set (that's only in the `fail` branch, not the `review` branch).
- why: The `review` branch enqueues `notify-admin` but does NOT set `requires_admin_review = true` on the invoice row. The vendor dashboard queries `requires_admin_review` to show a banner. Result: invoice is stuck at PAID, no banner shown, admin gets an email but the vendor has no visibility.
- fix: Add `await sb().from("invoices").update({ requires_admin_review: true }).eq("id", invoiceId)` in the `review` branch (same as the `fail` branch already does).
- confidence: high

---

### [MED] No `process.on('unhandledRejection')` handler — async throws in non-awaited paths crash silently

- file: `apps/daemon/src/index.ts` (entire file)
- lens: daemon
- what: The daemon has no `process.on('unhandledRejection', ...)` or `process.on('uncaughtException', ...)` handler. Several code paths use `void` fire-and-forget patterns (e.g. `void tick()` in the watcher, `void firePagerDuty(...)` in _dlq.ts). If these throw after the void, Node.js ≥15 terminates the process with no structured log. The `boot().catch(...)` only catches synchronous boot failures.
- why: A rejected promise in a void-fired path (e.g. the initial `tick()` call in the watcher, or `firePagerDuty`) will crash the daemon with an opaque error. Railway will restart it, but the crash reason won't appear in structured logs — only in stderr.
- fix: Add `process.on('unhandledRejection', (err) => { log.error('unhandledRejection', { err: (err as Error).message }); })` near the top of `index.ts`. Optionally exit(1) after logging so Railway's restart is clean.
- confidence: medium

---

### [MED] `notify-vendor` for `cashout.confirm_receipt` has no deterministic jobId

- file: `apps/daemon/src/workers/cashoutAdvancer.ts:253`
- lens: daemon
- what: The `proof-verify` branch's `queue("notify-vendor").add(orderId, { orderId, kind: "cashout.confirm_receipt" })` call has no `{ jobId: ... }` option. If BullMQ retries the proof-verify job (e.g. after a transient DB read failure that's now fixed), a duplicate "confirm receipt" email is sent to the vendor.
- why: Every other notify enqueue in cashoutAdvancer uses deterministic jobIds. This one was missed.
- fix: Add `{ jobId: \`notify-vendor_confirm_receipt_\${orderId}\` }`.
- confidence: high

---

### [LOW] `arcPublic()` type assertion loses chain-specific return types

- file: `apps/daemon/src/arc.ts:18`
- lens: daemon
- what: `arcPublic()` returns `PublicClient` (generic) rather than the chain-specific `PublicClient<Transport, typeof arcTestnet>`. The `getLogs` call in the watcher's `watch()` function works at runtime but loses type narrowing on `ev.args` — the `as unknown as readonly TypedLog<E>[]` cast at line 248 of arcSubscriber is required to paper over this.
- why: Minor type-safety gap. If a future developer adds a new event handler and forgets the cast, they'll get `unknown` args with no compile error.
- fix: Type `_public` as `PublicClient<HttpTransport, typeof arcTestnet>` and remove the cast in arcSubscriber.
- confidence: high (correctness of finding), low (severity)

---

### [LOW] `releaseClaimBounded` retry counter TTL of 90,000 seconds (25 hours) vs claim TTL of 86,400 seconds (24 hours)

- file: `apps/daemon/src/redis.ts:90`
- lens: daemon
- what: The retry counter's TTL (90,000s ≈ 25h) outlives the claim's TTL (86,400s = 24h) by 1 hour. After the claim expires naturally, the retry counter persists for another hour. If the same event key somehow re-fires in that 1h window (e.g. cursor overlap from REORG_OVERLAP), `claimOnce` succeeds (claim expired) but `releaseClaimBounded` reads a stale counter that's already at max → immediately holds the claim without any actual retry.
- why: Edge case: requires the exact same (txHash, logIndex) key to re-fire after 24h but before 25h. Extremely unlikely given the cursor advances monotonically, but the TTL mismatch is a latent bug.
- fix: Set retry counter TTL to match or be less than claim TTL, or clear the retry counter when `claimOnce` succeeds for a key.
- confidence: medium (finding correctness), low (practical impact)

---

### [LOW] Health endpoint `/status` queries `audit_logs` table — may not exist

- file: `apps/daemon/src/http.ts:30`
- lens: daemon
- what: The `/status` health check queries `sb().from("audit_logs").select(...)`. If this table doesn't exist in the Supabase schema (it's not referenced anywhere else in the daemon), the query returns `{ error }` → `dbOk = false` → health check reports unhealthy even when the DB is fine.
- why: The table name may be a leftover from an earlier schema version. If it was renamed or removed, the health check permanently reports `supabase: false`.
- fix: Query a table that definitely exists (e.g. `invoices` with `head: true, count: 'exact'`), or create the `audit_logs` table if it's intentional.
- confidence: medium

---

### [LOW] `env.REDIS_URL` default `redis://127.0.0.1:6379` in production is dangerous

- file: `apps/daemon/src/env.ts:14`
- lens: daemon
- what: `REDIS_URL` has a `.default("redis://127.0.0.1:6379")`. In production, if the env var is accidentally unset, the daemon silently connects to localhost Redis (which likely doesn't exist on Railway) → connection errors on every operation → all workers fail → DLQ fills. The env validation passes (default satisfies the schema) so there's no boot-time failure signal.
- why: The fail-closed principle applied to `SUPABASE_URL` (no default, required) should also apply to `REDIS_URL` in production. A daemon that boots successfully but can't reach Redis is worse than one that crashes at startup.
- fix: Remove the default, or add a `.refine()` that rejects localhost in `NODE_ENV=production`.
- confidence: high

---

### [LOW] `JobCompleted` handler doesn't guard against `status` already being `CLOSED`

- file: `apps/daemon/src/listener/arcSubscriber.ts:430-440`
- lens: daemon
- what: The `agent_jobs` update does `.update({ status: "CLOSED" }).eq("job_id", ev.args.jobId)` without a status guard (e.g. `.neq("status", "CLOSED")`). If the event re-fires (cursor overlap), the update succeeds but overwrites `closed_at` with a new timestamp. This is cosmetically wrong but not harmful. However, if a future status like `DISPUTED` is added after `CLOSED`, this update could regress the row.
- why: Minor — the `claimOnce` dedup makes re-fire extremely unlikely. But the pattern diverges from `InvoiceSettled` (which uses `.in("status", [...])` guards).
- fix: Add `.in("status", ["ACTIVE", "IN_PROGRESS"])` or `.neq("status", "CLOSED")` to the update filter.
- confidence: high (finding correctness), low (practical impact)

---

### [LOW] `Decided` handler outcome map missing `0` (e.g. NO_DECISION or default)

- file: `apps/daemon/src/listener/arcSubscriber.ts:462-467`
- lens: daemon
- what: `DB_OUTCOME` maps `{1, 2, 3, 4}` but not `0`. If the contract emits `outcome = 0` (e.g. a "dismissed" or "no action" decision), the update writes `outcome: undefined` (omitted from the spread). The `disputes` row gets `status: "DECIDED"` but `outcome: null`. This may be intentional (unknown outcome → null), but it's undocumented and could confuse operators.
- why: The Solidity enum likely starts at 0. If 0 means something meaningful (e.g. `NONE` or `DISMISSED`), the DB should reflect it.
- fix: Add `0: "DISMISSED"` (or whatever the contract's enum[0] is) to the map, or explicitly set `outcome: "UNKNOWN"` when the mapping is missing.
- confidence: medium

---

## Architecture Positives (for context)

1. **Cursor persistence + REORG_OVERLAP**: The getLogs-based polling with persisted cursor and 25-block overlap is a solid pattern for Arc's sub-second finality. Much more reliable than viem's filter-based `watchEvent`.
2. **Bounded retry with admin escalation + DLQ fallback**: The `releaseClaimBounded` → admin page → DLQ fallback chain is well-designed defense-in-depth.
3. **ABI drift guard at boot**: `assertListenerEventSigs()` prevents the entire class of "wrong topic → silent zero-match" bugs.
4. **Deterministic jobIds everywhere**: Near-universal use of deterministic BullMQ jobIds for cross-producer dedup is excellent.
5. **Graceful shutdown ordering**: stopDlqWatch → stopArcListener (with inflight drain) → closeAll (workers before queues) is correct.
6. **Service-role isolation**: Only the daemon holds `SUPABASE_SERVICE_ROLE_KEY`; web uses anon/user tokens with RLS.
7. **SSRF guard on webhook delivery**: Both store-time and fetch-time validation with redirect refusal.
