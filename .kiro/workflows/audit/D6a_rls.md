# D6a — RLS & Schema Audit of Klaro Supabase Migrations

**Auditor:** d6a_rls_migrations  
**Date:** 2026-05-31  
**Scope:** All 34 migrations (`apps/web/supabase/migrations/0001–0035`), 37 tables, all RLS policies  
**App-layer cross-ref:** `lib/repo/{disputes,team,webhooks,agentJobs,invoices,links}.ts` via `tryDb()` (RLS-scoped client)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| P0 (Critical — auth bypass / cross-tenant leak) | 2 |
| P1 (High — broken write path / data integrity) | 5 |
| P2 (Medium — cast trap / missing index / schema) | 6 |
| P3 (Low — hardening / defense-in-depth) | 4 |

**Key themes:**
1. **Missing write policies** — `vendor_team_members` and `disputes` (UPDATE) have no INSERT/UPDATE RLS policies, but the app's RLS-scoped client (`tryDb()`) writes to them. These paths will silently fail or throw in production.
2. **`::uuid` cast trap** — Multiple policies cast `text` columns (containing on-chain bytes32 hex) to `uuid`. These will throw `invalid input syntax for type uuid` at query time, effectively denying access to LP-party rows.
3. **`webhook_deliveries` INSERT denied** — The `recordDelivery` function writes via `tryDb()` but no INSERT policy exists.
4. **`for all` policies with `is_admin()` OR** — Several tables allow admin-role sessions to INSERT/UPDATE/DELETE any row via the `or is_admin()` clause in a `for all` policy. If an admin session token leaks, it's a full write to every tenant's data.

---

## Findings

### [P0] vendor_team_members: no INSERT/UPDATE policy — team invite/role-change will fail live
- file: `apps/web/supabase/migrations/0002_vendors_and_customers.sql:116`
- lens: rls
- what: `vendor_team_members` has only a SELECT policy (`team reads own vendor`). No INSERT or UPDATE policy exists anywhere in migrations 0001–0035.
- why: `lib/repo/team.ts:59` calls `.insert()` and `team.ts:70` calls `.update()` via `tryDb()` (RLS-scoped). PostgreSQL will deny both operations with `new row violates row-level security policy`. The entire team-invite and role-change flow is dead on a live Supabase instance.
- fix: Add INSERT policy: `for insert to authenticated with check (vendor_id = current_vendor_id())`. Add UPDATE policy: `for update to authenticated using (vendor_id = current_vendor_id()) with check (vendor_id = current_vendor_id())`.
- confidence: 99% — confirmed no INSERT/UPDATE policy in any migration; confirmed `tryDb()` usage in repo.

---

### [P0] disputes: no UPDATE policy — status advancement, evidence submission, and decide will fail live
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:232` + `0021_vendor_write_policies.sql:30`
- lens: rls
- what: `disputes` has a SELECT policy (0004:232) and an INSERT policy (0021:30), but NO UPDATE policy. The repo (`lib/repo/disputes.ts:155,163,172`) calls `.update()` on disputes via `tryDb()` for `addEvidence` (status change), `assignToReview`, and `decide`.
- why: All dispute state transitions via the vendor/admin UI will be denied by RLS. The `for select` policy doesn't grant UPDATE. The vendor can open a dispute but can never advance it.
- fix: Add: `create policy "disputes vendor update" on disputes for update to authenticated using (claimant_kind = 'vendor' and claimant_id::uuid = current_vendor_id()) with check (claimant_kind = 'vendor' and claimant_id::uuid = current_vendor_id());` — and a separate admin update policy.
- confidence: 98% — confirmed no UPDATE policy in any migration; confirmed `.update()` calls in repo.

---

### [P1] LP RLS policies: `lp_id::uuid` cast on text bytes32 hex — always throws
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:211-215`
- lens: rls
- what: Policies on `lp_kyb`, `lp_limits`, `lp_stakes`, `lp_reputation` call `is_lp_owner(lp_kyb.lp_id::uuid)`. The `lp_id` column in these tables is `text` referencing `lp_profiles(lp_id)` — which stores on-chain bytes32 hex strings (e.g., `0xabcdef...`). Casting a 66-char hex string to `uuid` will always fail with `invalid input syntax for type uuid`.
- why: `is_lp_owner(uuid)` checks `lp_profiles.id` (the uuid PK), not `lp_profiles.lp_id` (the text on-chain identifier). The cast is a type mismatch: the text value is never a valid uuid. Result: LP sessions can never read their own KYB, limits, stakes, or reputation via the RLS client. The policies effectively deny all access (except admin fallback).
- fix: Change the policies to join through `lp_profiles` to resolve the text `lp_id` to the uuid `id`: `exists(select 1 from lp_profiles lp where lp.lp_id = lp_kyb.lp_id and lp.supabase_user_id = auth.uid())` — or change `is_lp_owner` to accept text and do the join internally.
- confidence: 97% — confirmed `lp_id` is text (bytes32 hex), `is_lp_owner` takes uuid, cast will fail.

---

### [P1] disputes RLS: `respondent_id::uuid` cast trap when respondent_kind = 'lp'
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:237` + `0014_dispute_evidence_rls.sql:24`
- lens: rls
- what: The disputes SELECT policy and the dispute_evidence SELECT policy both contain `(d.respondent_kind = 'lp' and is_lp_owner(d.respondent_id::uuid))`. When `respondent_kind = 'lp'`, `respondent_id` is the LP's text identifier (on-chain bytes32 hex or the LP's uuid string — depends on caller). If it's a bytes32 hex, the `::uuid` cast throws. PostgreSQL evaluates all OR branches for all rows visible to the planner — the cast can throw even when the row's `respondent_kind` is not 'lp' if the planner doesn't short-circuit.
- why: LP respondents may be unable to view disputes filed against them. Worse, if any row in the table has a non-uuid-parseable `respondent_id` with `respondent_kind = 'lp'`, the entire query may fail for all users (the cast error propagates).
- fix: Wrap in a safe cast: `(d.respondent_kind = 'lp' and d.respondent_id::text ~ '^[0-9a-f]{8}-...$' and is_lp_owner(d.respondent_id::uuid))` — or better, use a subquery join through `lp_profiles` matching on the text `lp_id` field.
- confidence: 90% — depends on what values the app actually stores in `respondent_id` for LP disputes. The `openDispute` function in `disputes.ts:184` accepts a free-form string.

---

### [P1] cashout_orders LP policy: `is_lp_owner(lp_id::uuid)` — same cast trap
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:218`
- lens: rls
- what: `create policy "cashout lp scope" on cashout_orders for select using (lp_id is not null and is_lp_owner(lp_id::uuid))`. `cashout_orders.lp_id` is `text references lp_profiles(lp_id)` — the on-chain bytes32 hex. Casting to uuid will always fail.
- why: LPs can never see cashout orders assigned to them via the RLS client. The policy is dead code.
- fix: Same as the LP tables fix — resolve through `lp_profiles` join or change `is_lp_owner` signature.
- confidence: 97%

---

### [P1] webhook_deliveries: no INSERT policy — recordDelivery via tryDb() will be denied
- file: `apps/web/supabase/migrations/0005_erp_webhooks_audit_agents.sql:157`
- lens: rls
- what: `webhook_deliveries` has only a SELECT policy (`deliveries vendor scope`). `lib/repo/webhooks.ts:93` calls `.insert()` on `webhook_deliveries` via `tryDb()`.
- why: The INSERT will be denied by RLS. The code wraps it in a try/catch and swallows the error (`/* best-effort */`), so it won't crash — but delivery audit rows will never persist when called from the vendor session path.
- fix: Either add an INSERT policy scoped to the vendor's webhooks, or switch `recordDelivery` to use `serviceDb()` (since delivery recording is an internal audit concern, not a user-facing write).
- confidence: 95% — the code explicitly catches and swallows, so it's "working" but silently losing data.

---

### [P1] `for all` policies with `or is_admin()` grant full CRUD to admin sessions
- file: `apps/web/supabase/migrations/0005_erp_webhooks_audit_agents.sql:153-167`
- lens: rls
- what: Tables `erp_connections`, `erp_sync_jobs`, `webhooks`, `agent_wallets`, `agent_jobs`, `cashout_orders`, `cashout_quotes`, `customers` all use `for all using (vendor_id = current_vendor_id() or is_admin())`. This means any admin session can INSERT/UPDATE/DELETE rows in any vendor's data — including forging invoices, modifying cashout orders, or deleting webhooks.
- why: If an admin JWT is compromised (XSS, token theft, session fixation), the attacker has unrestricted write access to every tenant's financial data. The `is_admin()` check in a `for all` policy is overly broad — admins should have read-all but write-restricted access via separate policies.
- fix: Split into `for select using (... or is_admin())` + `for insert/update/delete using (vendor_id = current_vendor_id())`. Admin writes should go through `serviceDb()` with explicit authorization checks.
- confidence: 85% — this is a design choice vs. a bug; severity depends on threat model for admin token compromise.

---

### [P2] audit_logs: `subject_id::uuid` cast may throw for non-vendor subjects
- file: `apps/web/supabase/migrations/0005_erp_webhooks_audit_agents.sql:161`
- lens: rls
- what: Policy: `is_admin() or (subject_kind = 'vendor' and subject_id::uuid = current_vendor_id())`. `subject_id` is `text` and can contain non-uuid values (e.g., invoice hex ids, LP text ids). PostgreSQL does NOT guarantee short-circuit evaluation of AND in USING clauses — the planner may evaluate `subject_id::uuid` before checking `subject_kind = 'vendor'`.
- why: If any `audit_logs` row has `subject_kind != 'vendor'` and a non-uuid `subject_id`, a vendor's SELECT query may throw `invalid input syntax for type uuid` instead of returning results.
- fix: Use a safe cast: `subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-...' and subject_id::uuid = current_vendor_id()` — or use a subquery: `exists(select 1 from vendors v where v.id = current_vendor_id() and subject_kind = 'vendor' and subject_id = v.id::text)`.
- confidence: 80% — depends on whether non-uuid subject_ids actually exist in the table. Given `subject_kind` includes 'invoice', 'cashout', 'lp', 'dispute', 'contract', it's likely.

---

### [P2] Missing index: `vendor_team_members.email` — invite acceptance lookup
- file: `apps/web/supabase/migrations/0002_vendors_and_customers.sql:44`
- lens: schema
- what: No index on `vendor_team_members(email)`. The invite-acceptance flow (when a user signs up and needs to be linked to their pending invite) must look up by email.
- why: Without an index, the lookup is a sequential scan. Low volume now but will degrade as team sizes grow.
- fix: `create index if not exists team_members_email_idx on vendor_team_members(email) where removed_at is null;`
- confidence: 70% — depends on whether the acceptance flow actually queries by email (likely given 0034 allows null `supabase_user_id`).

---

### [P2] `erp_connections.auth_token_ciphertext`: nullable, no NOT NULL constraint
- file: `apps/web/supabase/migrations/0005_erp_webhooks_audit_agents.sql:9`
- lens: schema
- what: `auth_token_ciphertext text` is nullable. An ERP connection without an encrypted token is useless but can be persisted.
- why: A row with `status = 'active'` and `auth_token_ciphertext = NULL` would cause the ERP sync worker to fail at runtime when it tries to decrypt. Should be NOT NULL or have a CHECK constraint: `check (status != 'active' or auth_token_ciphertext is not null)`.
- fix: `alter table erp_connections add constraint erp_active_needs_token check (status != 'active' or auth_token_ciphertext is not null);`
- confidence: 75%

---

### [P2] `invoices.customer_email`: stored in plaintext, no encryption at rest
- file: `apps/web/supabase/migrations/0003_invoices_payments_receipts.sql:16`
- lens: schema
- what: `customer_email citext` is stored in plaintext. The README states "No PII is stored on chain" but the off-chain DB stores customer emails in the clear.
- why: If the database is compromised, all customer emails across all vendors are exposed. Given the privacy_mode feature exists to hide customer info from the public invoice page, the underlying storage should also protect it.
- fix: Encrypt at rest using `pgp_sym_encrypt` (same pattern as `webhooks.secret_ciphertext`) or use Supabase Vault. Alternatively, store only a hash for lookup and the encrypted value for display.
- confidence: 70% — this is a defense-in-depth recommendation; Supabase's disk encryption may be considered sufficient.

---

### [P2] `payment_routes.state`: text column, no enum or CHECK constraint
- file: `apps/web/supabase/migrations/0003_invoices_payments_receipts.sql:56`
- lens: schema
- what: `state text not null default 'pending'` with valid values documented in a comment but no CHECK constraint or enum type. Any string can be inserted.
- why: Data integrity risk — a typo in a daemon worker (e.g., `'settlled'`) would persist silently and the route would be stuck in an unrecognized state forever.
- fix: `alter table payment_routes add constraint payment_routes_state_check check (state in ('pending','burning','attesting','minting','settled','refunded','failed'));`
- confidence: 80%

---

### [P2] `disputes.status`: text column, no enum or CHECK constraint
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:168`
- lens: schema
- what: `status text not null default 'OPENED'` — valid values documented in comment but no constraint. The `dispute_outcome` enum exists for `outcome` but `status` is free-text.
- why: Same data integrity risk as payment_routes. A typo in the daemon or repo code persists an invalid status.
- fix: Create an enum or add a CHECK: `check (status in ('OPENED','EVIDENCE_REQUESTED','EVIDENCE_SUBMITTED','UNDER_REVIEW','DECIDED','CLOSED'))`.
- confidence: 85%

---

### [P3] `lp_profiles` `for all` policy allows LP to DELETE their own profile
- file: `apps/web/supabase/migrations/0004_lp_and_cashout.sql:209`
- lens: rls
- what: `create policy "lp owns profile" on lp_profiles for all using (supabase_user_id = auth.uid() or is_admin())`. The `for all` includes DELETE.
- why: An LP could delete their own profile row, which would CASCADE delete their `lp_kyb`, `lp_limits`, `lp_stakes`, `lp_reputation` rows — destroying audit history and potentially orphaning active cashout orders (which have `on delete set null` on `lp_id`).
- fix: Split into SELECT + UPDATE policies. DELETE should require admin/service-role.
- confidence: 85%

---

### [P3] `customers` `for all` policy allows vendor to DELETE customer records
- file: `apps/web/supabase/migrations/0002_vendors_and_customers.sql:121`
- lens: rls
- what: `create policy "customers vendor scope" on customers for all using (vendor_id = current_vendor_id() or is_admin())`. Includes DELETE.
- why: A vendor could delete customer records that are referenced by invoices (`customer_id uuid references customers(id) on delete set null`). This would null out the FK on historical invoices, losing the customer association for audit/receipt purposes.
- fix: Either restrict to SELECT + INSERT + UPDATE (no DELETE), or add a soft-delete pattern.
- confidence: 70%

---

### [P3] Migration ordering: 0009 is missing (gap between 0008 and 0010)
- file: N/A
- lens: schema
- what: Migration numbering jumps from 0008 to 0010. No `0009_*.sql` file exists.
- why: Supabase migrations run in lexicographic order, so the gap is harmless functionally. However, it suggests a migration was deleted or never committed, which could indicate a lost schema change.
- fix: Verify no migration was accidentally dropped. If intentional (e.g., a reverted migration), document in a comment.
- confidence: 60% — cosmetic unless a migration was actually lost.

---

### [P3] `handle_new_user` trigger: race condition on `ON CONFLICT (email) DO UPDATE`
- file: `apps/web/supabase/migrations/0031_handle_new_user_relink_orphan.sql:20`
- lens: schema
- what: The `ON CONFLICT (email) DO UPDATE SET supabase_user_id = excluded.supabase_user_id WHERE ... AND NOT EXISTS (select 1 from auth.users u where u.id = vendors.supabase_user_id)` has a TOCTOU race: between the `NOT EXISTS` check and the UPDATE, the old user could be re-created (e.g., by a concurrent signup flow).
- why: In practice, Supabase serializes auth.users inserts per email, so concurrent signups for the same email are unlikely. But under high concurrency or if the auth provider allows it, the trigger could incorrectly re-link a vendor to a new user while the old user still exists.
- fix: Add a unique constraint or advisory lock. Low priority given Supabase's auth serialization.
- confidence: 50% — theoretical race, unlikely in practice.

---

## Tables Without Issues (Confirmed Correct)

| Table | RLS | Policies | Notes |
|-------|-----|----------|-------|
| `admins` | ✅ | SELECT only (correct — writes via service-role) | |
| `vendors` | ✅ | SELECT + UPDATE (0002, 0021) | INSERT via service-role (trigger) |
| `invoices` | ✅ | SELECT + INSERT + UPDATE (0003, 0013, 0021) | Public read removed in 0013 |
| `invoice_line_items` | ✅ | SELECT + INSERT (0013, 0021) | `or true` fixed in 0013 |
| `payment_routes` | ✅ | SELECT only (writes via service-role daemon) | |
| `screening_results` | ✅ | SELECT only (writes via service-role daemon) | |
| `counterparty_screen_cache` | ✅ | SELECT admin-only | |
| `receipts` | ✅ | SELECT `using(true)` — intentionally public | |
| `dead_letter_jobs` | ✅ | SELECT + UPDATE admin-only; INSERT/DELETE revoked | |
| `push_subscriptions` | ✅ | SELECT vendor-scoped; writes revoked | |
| `webauthn_credentials` | ✅ | SELECT vendor-scoped; writes revoked | |
| `webauthn_challenges` | ✅ | All DML revoked from authenticated | |
| `lp_members` | ✅ | SELECT vendor-scoped; writes revoked | |
| `kpi_snapshots` | ✅ | SELECT admin-only; writes revoked | |
| `protocol_limits` | ✅ | SELECT `using(true)` (non-sensitive config); writes revoked | |
| `contact_submissions` | ✅ | SELECT + DELETE admin-only; writes revoked | |
| `sanctions_refresh_runs` | ✅ | SELECT admin-only; writes revoked | |
| `payment_links` | ✅ | SELECT + INSERT + UPDATE vendor-scoped (0027) | |

---

## Summary of Broken Live Paths (tryDb writes that will fail)

| Repo function | Table | Operation | Policy exists? | Will succeed? |
|---------------|-------|-----------|----------------|---------------|
| `team.inviteTeammate()` | `vendor_team_members` | INSERT | ❌ | ❌ |
| `team.changeRole()` | `vendor_team_members` | UPDATE | ❌ | ❌ |
| `team.removeTeammate()` | `vendor_team_members` | UPDATE | ❌ | ❌ |
| `disputes.addEvidence()` | `disputes` | UPDATE | ❌ | ❌ |
| `disputes.assignToReview()` | `disputes` | UPDATE | ❌ | ❌ |
| `disputes.decide()` | `disputes` | UPDATE | ❌ | ❌ |
| `webhooks.recordDelivery()` | `webhook_deliveries` | INSERT | ❌ | ❌ (swallowed) |

---

## Recommendations (Priority Order)

1. **Immediate (P0):** Add INSERT + UPDATE policies for `vendor_team_members` and UPDATE policy for `disputes`.
2. **Immediate (P1):** Fix all `::uuid` cast traps in LP-related policies — either change `is_lp_owner` to accept text and join internally, or rewrite policies to use subquery joins.
3. **Short-term (P1):** Decide whether `webhook_deliveries` INSERT should go through `serviceDb()` or get an INSERT policy.
4. **Short-term (P1):** Audit all `for all` policies and split into granular per-operation policies where DELETE is inappropriate.
5. **Medium-term (P2):** Add CHECK constraints or enums for `payment_routes.state` and `disputes.status`.
6. **Medium-term (P2):** Add safe-cast guards to `audit_logs` and `disputes` policies to prevent query-time exceptions.
