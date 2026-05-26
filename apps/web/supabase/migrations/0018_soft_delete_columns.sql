-- Klaro · 0018 soft-delete columns
-- four daemon workers (lifecycleReminders, adminRisk,
-- kpiAggregator, cashoutAdvancer) filter their reads with `.is("deleted_at",
-- null)` per iters 73/75/78/80 — but no migration ever added the column.
-- Every cron tick fired PostgREST `column "deleted_at" does not exist`,
-- DLQ'd, and four cron-driven flows were silently dead since the
-- soft-delete pattern landed. made the PostgREST errors
-- throw (was silent empty result) so the failure went from invisible to
-- noisy-but-still-broken; this migration is what makes the queries work.
-- Soft-delete semantics: rows with `deleted_at IS NOT NULL` are hidden
-- from cron-driven workers but kept in the table for audit purposes
-- (regulator queries, dispute reconstruction). Hard-delete remains
-- available via service-role for GDPR right-to-erasure flows.

alter table invoices       add column if not exists deleted_at timestamptz;
alter table cashout_orders add column if not exists deleted_at timestamptz;
alter table disputes       add column if not exists deleted_at timestamptz;
alter table lp_profiles    add column if not exists deleted_at timestamptz;

-- Partial indexes so the active-row queries (the cron worker reads) stay fast
-- even when the table has many soft-deleted rows. The cron filters always
-- combine `deleted_at IS NULL` with another predicate, so a partial index
-- on the soft-delete column itself is exactly what PostgREST will plan
-- against.
create index if not exists invoices_active_idx
  on invoices (created_at desc) where deleted_at is null;
create index if not exists cashout_orders_active_idx
  on cashout_orders (requested_at desc) where deleted_at is null;
create index if not exists disputes_active_idx
  on disputes (updated_at desc) where deleted_at is null;
create index if not exists lp_profiles_active_idx
  on lp_profiles (tier desc) where deleted_at is null;

comment on column invoices.deleted_at is
  'Iter 92 F1: nullable soft-delete marker. Cron workers filter `is("deleted_at", null)`. Hard-delete remains via service-role for GDPR right-to-erasure.';
