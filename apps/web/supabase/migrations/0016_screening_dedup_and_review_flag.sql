-- 0016_screening_dedup_and_review_flag.sql
-- two related defects in the
-- screening pipeline.
-- 1) `screening_results` had no idempotency on (invoice_id, provider).
-- Retries of `screen-and-settle` (BullMQ backoff, listener fires
-- twice, manual replay) inserted duplicate rows — three new
-- `chainalysis.sanctions` rows per retry, etc. The audit log then
-- showed N×3 entries per invoice, breaking the "3-of-3 screening"
-- invariant the v2 §14 design depends on. Composite unique fixes
-- it without changing the worker's insert shape (upsert below).
-- 2) When a screening provider returns `fail`, the worker logged a
-- warn + notified admin but did not surface a vendor-visible
-- state. Invoice status stayed PAID (the row is already PAID, so
-- the worker's `update status='PAID'` was a no-op), so vendor
-- dashboards rendered the invoice as paid-but-not-yet-settled
-- indefinitely with no honest "this is blocked, awaiting review"
-- label. Adding `requires_admin_review` as a boolean column keeps
-- the on-chain mirror (`status`) untouched while letting the UI
-- render an honest banner + admin tooling page the row up.

alter table screening_results
  add constraint screening_results_invoice_provider_unique
  unique (invoice_id, provider);

alter table invoices
  add column if not exists requires_admin_review boolean not null default false;

create index if not exists invoices_requires_admin_review_idx
  on invoices (requires_admin_review)
  where requires_admin_review = true;
