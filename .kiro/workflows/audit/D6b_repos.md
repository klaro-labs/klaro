# D6b — Repo-Layer Audit: RLS, Schema, and Dual-Mode Correctness

**Auditor:** d6b_repo_layer  
**Date:** 2026-05-31  
**Scope:** `apps/web/lib/repo/*.ts`, `apps/web/lib/db.ts`, migrations 0002–0005, 0018, 0021, 0032–0035

## Summary

**5 Critical / 3 High / 4 Medium findings.**

The most severe class: three repo modules (`disputes`, `team`, `webhooks`) perform INSERT or UPDATE operations via the RLS-scoped `tryDb()` client against tables that have **no matching INSERT/UPDATE RLS policy**. In live mode these writes silently return zero affected rows (Supabase/PostgREST does not throw on policy denial for UPDATE — it returns an empty result set). The mock path works perfectly, so the divergence is invisible in dev.

Additionally, the `disputes` repo writes a `dispute_outcome` enum value (`MUTUAL_RESOLVED`) that does not exist in the Postgres enum, which will hard-fail the UPDATE in live mode.

---

## Findings

### [P0-CRITICAL] disputes UPDATE via RLS client has no UPDATE policy — status transitions silently fail in live mode

- file: `apps/web/lib/repo/disputes.ts:139` (`addEvidence` → `.update({ status: nextStatus })`), `:149` (`assignToReview`), `:156` (`decide`)
- lens: repo-layer / RLS
- what: `addEvidence()`, `assignToReview()`, and `decide()` all call `.from("disputes").update(...)` via the RLS-scoped `tryDb()` client. The `disputes` table has only a `for select` policy (0004:232) and a `for insert` policy (0021:30). **No `for update` policy exists.**
- why: PostgREST/Supabase returns `{ data: null, error: null }` when an UPDATE matches zero rows due to RLS denial. The `decide()` function interprets null data as "already decided" and re-reads — masking the real failure. `addEvidence` and `assignToReview` call `getDispute()` after the silent no-op, returning stale state. In mock mode all three work perfectly, hiding the live-mode failure.
- fix: Add a `for update` policy on `disputes`: `CREATE POLICY "disputes party update" ON disputes FOR UPDATE USING (is_admin() OR (claimant_kind = 'vendor' AND claimant_id::uuid = current_vendor_id()) OR (respondent_kind = 'vendor' AND respondent_id::uuid = current_vendor_id()) OR (claimant_kind = 'lp' AND is_lp_owner(claimant_id::uuid)) OR (respondent_kind = 'lp' AND is_lp_owner(respondent_id::uuid)));`
- confidence: 99% — verified no UPDATE policy exists across all migrations.

---

### [P0-CRITICAL] vendor_team_members INSERT/UPDATE via RLS client has no write policies — invites, role changes, and removals silently fail

- file: `apps/web/lib/repo/team.ts:53` (`inviteTeammate` → `.insert()`), `:67` (`changeRole` → `.update()`), `:79` (`removeTeammate` → `.update()`)
- lens: repo-layer / RLS
- what: The `vendor_team_members` table has only one policy: `"team reads own vendor"` which is `for select` (0002:116). There are no INSERT, UPDATE, or DELETE policies anywhere in the migration history. All three write functions use the RLS-scoped `tryDb()` client.
- why: INSERT will fail with a PostgREST error (new row violates RLS). UPDATE will silently return zero rows. Mock mode works perfectly. The team management UI will appear functional in dev but be completely broken in live.
- fix: Add INSERT + UPDATE policies: `CREATE POLICY "team vendor insert" ON vendor_team_members FOR INSERT WITH CHECK (vendor_id = current_vendor_id()); CREATE POLICY "team vendor update" ON vendor_team_members FOR UPDATE USING (vendor_id = current_vendor_id());`
- confidence: 99% — verified no write policy exists.

---

### [P0-CRITICAL] webhook_deliveries INSERT via RLS client denied — recordDelivery is a silent no-op in live mode

- file: `apps/web/lib/repo/webhooks.ts:96` (`recordDelivery` → `.from("webhook_deliveries").insert(...)`)
- lens: repo-layer / RLS
- what: The `webhook_deliveries` table has only a `for select` policy (0005:157 `"deliveries vendor scope"`). No INSERT policy exists. `recordDelivery()` uses the RLS-scoped `tryDb()` client. The function wraps the call in `try/catch` and swallows errors ("best-effort"), so the failure is completely silent.
- why: The comment says "the delivery worker owns this table via the service role" — but `recordDelivery` is called from the vendor-facing test-ping path, not the daemon. It should either use `serviceDb()` or have an INSERT policy.
- fix: Either (a) switch to `serviceDb()` for this specific insert (since the vendor already proved ownership of the webhook via the parent read), or (b) add an INSERT policy scoped through the parent webhook's vendor_id.
- confidence: 95% — the try/catch confirms the author anticipated failures but didn't fix the root cause.

---

### [P0-CRITICAL] `MUTUAL_RESOLVED` outcome not in DB enum — decide() will hard-fail with invalid enum value

- file: `apps/web/lib/repo/disputes.ts:156` (`decide()` writes `outcome` to the `dispute_outcome` enum column)
- lens: repo-layer / schema mismatch
- what: The TS code defines `TS_OUTCOMES` including `"MUTUAL_RESOLVED"` (line 18). The DB enum `dispute_outcome` (0004:152) contains only: `PENDING, RELEASE_TO_CLAIMANT, REFUND_TO_RESPONDENT, ASK_MORE_EVIDENCE, SLASH_LP, PENALIZE_VENDOR, CANCELLED`. No migration ever adds `MUTUAL_RESOLVED`.
- why: If `decide()` is called with `outcome = "MUTUAL_RESOLVED"`, the UPDATE will throw `invalid input value for enum dispute_outcome: "MUTUAL_RESOLVED"`. Unlike the RLS-denial silent failures above, this one throws and propagates to the user.
- fix: Add migration: `ALTER TYPE dispute_outcome ADD VALUE IF NOT EXISTS 'MUTUAL_RESOLVED';`
- confidence: 99% — grep confirms no migration adds this value.

---

### [P0-CRITICAL] disputes decide() UPDATE denied by missing UPDATE policy — on-chain Decided events cannot be mirrored to DB

- file: `apps/web/lib/repo/disputes.ts:156` (`decide()`)
- lens: repo-layer / RLS
- what: `decide()` is called both from the operator UI (admin action) and from the daemon's on-chain event handler. When called from the operator UI via a server action that uses the user's session (RLS client), the UPDATE is denied because no UPDATE policy exists on `disputes`. The function's idempotency guard (`neq("status", "DECIDED")`) further narrows the result, but the RLS denial happens first.
- why: This is the same root cause as finding #1 but with a distinct impact: dispute resolution — the most critical state transition in the protocol — cannot be persisted from the vendor/operator UI path. The daemon path (serviceDb) works, but any admin-panel "Decide" button using the session client is broken.
- fix: Same as finding #1 — add UPDATE policy. Additionally, consider whether `decide()` should always use `serviceDb()` since it's an operator-only action.
- confidence: 99%

---

### [HIGH] `as unknown as TablesInsert<...>` casts hide schema mismatches in disputes and team repos

- file: `apps/web/lib/repo/disputes.ts:109,120` (openDispute payload + evidence insert), `apps/web/lib/repo/team.ts:55,69,80` (invite, changeRole, removeTeammate), `apps/web/lib/repo/agentJobs.ts:72,95` (createJob, advanceJob)
- lens: repo-layer / type safety
- what: Every write in these repos casts the payload through `as unknown as TablesInsert<"...">` or `TablesUpdate<"...">`, completely bypassing TypeScript's column-name and type checking. This means:
  - A typo in a column name compiles fine but fails at runtime.
  - A type mismatch (e.g., passing a string where the codegen expects a number) is invisible.
  - New required columns added by migrations won't trigger compile errors.
- why: The casts were likely added because the hand-built payload objects don't match the generated types (e.g., `disputes` payload includes `claimant_label` / `respondent_label` / `opening_note` which were added in 0032 but may not be in the generated types yet). The fix should be to regenerate `database.types.ts` from the live schema, then remove the casts.
- fix: Run `supabase gen types typescript` against the current schema, update `database.types.ts`, and remove all `as unknown as` casts. Any remaining type errors reveal real bugs.
- confidence: 90%

---

### [HIGH] team.ts changeRole/removeTeammate use `TablesInsert` type for UPDATE operations

- file: `apps/web/lib/repo/team.ts:69` (`changeRole`), `:80` (`removeTeammate`)
- lens: repo-layer / type correctness
- what: Both functions cast their update payload as `TablesInsert<"vendor_team_members">` instead of `TablesUpdate<"vendor_team_members">`. While the `as unknown` cast makes this compile, it's semantically wrong — `TablesInsert` may have required fields that `TablesUpdate` (which makes all fields optional) does not.
- why: Copy-paste from the insert path. If the `as unknown` cast is ever removed, these lines will fail to compile with missing required fields.
- fix: Change to `as unknown as TablesUpdate<"vendor_team_members">` (and then remove the cast entirely after regenerating types).
- confidence: 95%

---

### [HIGH] disputes addEvidence sets submitter_id to literal "self" — breaks audit traceability

- file: `apps/web/lib/repo/disputes.ts:130` (`addEvidence`)
- lens: repo-layer / data integrity
- what: `addEvidence()` sets `submitter_id: "self"` regardless of who is submitting. The `dispute_evidence` table's `submitter_id` column is meant to hold the actual actor's ID (vendor UUID, LP UUID, or admin UUID) for audit trail purposes.
- why: The mock path (`mockAddEvidence`) doesn't use submitter_id, so this was never caught. In live mode, every evidence row will have `submitter_id = "self"`, making it impossible to determine who submitted what in a multi-party dispute.
- fix: Pass the actual actor ID (from the session) into `addEvidence()` and use it as `submitter_id`. The 0032 RLS policy checks the parent dispute's parties, not `submitter_id`, so the policy will still pass.
- confidence: 90%

---

### [MEDIUM] disputes openDispute respondent_id="system" will fail ::uuid cast in SELECT policy

- file: `apps/web/lib/repo/disputes.ts:109` (`openDispute` sets `respondent_id: input.respondentId ?? "system"`)
- lens: repo-layer / RLS read-back
- what: When `respondentKind` is `"system"` and `respondentId` is `"system"`, the SELECT policy (0004:232) evaluates `respondent_id::uuid` which will throw `invalid input syntax for type uuid: "system"`. This means disputes with a system respondent cannot be read back by the respondent path.
- why: The SELECT policy has branches for `respondent_kind = 'vendor'` and `respondent_kind = 'lp'` that cast `respondent_id::uuid`. When `respondent_kind = 'system'`, neither branch fires (the cast is inside the `AND`), so Postgres short-circuits and the cast is never evaluated. **Actually safe** — the `AND` prevents the cast from executing when kind ≠ 'vendor'/'lp'.
- fix: No fix needed — the `AND` short-circuit protects against the cast. However, adding a comment in the code would prevent future confusion.
- confidence: 70% (safe due to AND short-circuit, but fragile if policy is refactored)

---

### [MEDIUM] agentJobs advanceJob builds dynamic column names from STATUS_TS map — potential for unmapped statuses

- file: `apps/web/lib/repo/agentJobs.ts:82-88` (`advanceJob`)
- lens: repo-layer / correctness
- what: `STATUS_TS` maps only `FUNDED`, `STARTED`, `DELIVERED`, `CLOSED` to timestamp columns. The `agent_job_status` enum also includes `DISPUTED` and `CANCELLED`. If `advanceJob` is called with `to = "DISPUTED"` or `to = "CANCELLED"`, no timestamp column is set — the job transitions status but has no record of when.
- why: The DB schema has no `disputed_at` or `cancelled_at` columns, so this is arguably correct (no column to set). But the mock path (`mockAdvanceAgentJob`) may behave differently, and the lack of a timestamp for terminal states makes audit reconstruction harder.
- fix: Either add `disputed_at` / `cancelled_at` columns to the schema, or document that these statuses intentionally have no timestamp. Consider using `updated_at` (set by trigger) as the proxy.
- confidence: 75%

---

### [MEDIUM] webhooks.ts recordDelivery passes `delivered_at: null` for failed deliveries — schema has NOT NULL constraint?

- file: `apps/web/lib/repo/webhooks.ts:101` (`recordDelivery`)
- lens: repo-layer / schema
- what: When `status === "fail"`, the code passes `delivered_at: null`. The `webhook_deliveries` schema (0005) defines `delivered_at timestamptz` as nullable (no NOT NULL constraint), so this is technically valid. However, the `idempotency_key` is set to `testping-${Date.now()}` — if the same test ping is retried within the same millisecond, the unique constraint `(webhook_id, idempotency_key)` will reject the second insert.
- why: Sub-millisecond retries are unlikely in practice, but the idempotency key should include more entropy (e.g., a random suffix) to be robust.
- fix: Use `crypto.randomUUID()` or append random bytes to the idempotency key.
- confidence: 60% (low practical risk but technically a constraint violation path)

---

### [MEDIUM] Dual-mode divergence: mock paths return success for writes that would fail under RLS in live mode

- file: `apps/web/lib/repo/disputes.ts:139,149,156`, `apps/web/lib/repo/team.ts:53,67,79`, `apps/web/lib/repo/webhooks.ts:96`
- lens: repo-layer / dual-mode
- what: All mock functions (`mockAddEvidence`, `mockAssignDisputeToReview`, `mockDecideDispute`, `mockInviteTeammate`, `mockChangeTeamRole`, `mockRemoveTeammate`, `mockRecordWebhookDelivery`) return success unconditionally. The live paths fail silently due to missing RLS policies. This means:
  - Dev testing shows all features working.
  - Live deployment has broken dispute management, broken team management, and broken delivery logging.
  - No integration test catches this because tests run in mock mode.
- why: The dual-mode pattern is sound in principle but requires that every live write path has a matching RLS policy. The mock path cannot validate this.
- fix: (1) Add the missing RLS policies (findings #1–#3). (2) Add an integration test suite that runs against a real Supabase instance with RLS enabled. (3) Consider a CI check that verifies every `tryDb().from(X).insert/update` has a corresponding policy for the expected role.
- confidence: 95%

---

## Policy Coverage Matrix (Write Operations)

| Repo Function | Table | Operation | RLS Policy Exists? | Will Succeed Live? |
|---|---|---|---|---|
| `disputes.openDispute` | `disputes` | INSERT | ✅ (0021) | ✅ |
| `disputes.addEvidence` (evidence) | `dispute_evidence` | INSERT | ✅ (0032) | ✅ |
| `disputes.addEvidence` (status) | `disputes` | UPDATE | ❌ | ❌ Silent no-op |
| `disputes.assignToReview` | `disputes` | UPDATE | ❌ | ❌ Silent no-op |
| `disputes.decide` | `disputes` | UPDATE | ❌ | ❌ Silent no-op |
| `team.inviteTeammate` | `vendor_team_members` | INSERT | ❌ | ❌ Throws |
| `team.changeRole` | `vendor_team_members` | UPDATE | ❌ | ❌ Silent no-op |
| `team.removeTeammate` | `vendor_team_members` | UPDATE | ❌ | ❌ Silent no-op |
| `webhooks.recordDelivery` | `webhook_deliveries` | INSERT | ❌ | ❌ Swallowed |
| `webhooks.createWebhook` | `webhooks` | RPC (SECURITY DEFINER) | N/A | ✅ |
| `agentJobs.createJob` | `agent_jobs` | INSERT | ✅ (for all) | ✅ |
| `agentJobs.advanceJob` | `agent_jobs` | UPDATE | ✅ (for all) | ✅ |
| `invoices.createInvoice` | `invoices` | INSERT | ✅ (0021) | ✅ |
| `cashouts.createCashout` | `cashout_orders` | INSERT | ✅ (0021) | ✅ |
| `cashouts.advanceCashout` | `cashout_orders` | UPDATE | ✅ (0021) | ✅ |
| `vendors.getOrAutoProvisionVendor` | `vendors` | INSERT | ❌ (by design — trigger) | ⚠️ Race fallback |

---

## Recommendations

1. **Immediate (pre-testnet-QA):** Add UPDATE policy on `disputes` and INSERT+UPDATE policies on `vendor_team_members`. These are the only tables where the repo layer performs writes via the RLS client without a matching policy.

2. **Short-term:** Regenerate `database.types.ts` and remove all `as unknown as` casts. Any compile errors that surface are real bugs.

3. **Short-term:** Add `MUTUAL_RESOLVED` to the `dispute_outcome` enum via migration.

4. **Medium-term:** Add a CI lint that cross-references every `tryDb().from(X).insert/update` call against the declared RLS policies, flagging any table/operation pair without coverage.

5. **Medium-term:** Run integration tests against a real Supabase instance with RLS enabled to catch mock↔live divergence.
