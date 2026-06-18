-- 0052: ensure vendors.max_cashout_usdc_daily exists.
--
-- The daily-cashout-cap perimeter (prepareCashoutRequestAction, launch audit
-- 2026-06-01) reads vendors.max_cashout_usdc_daily. The column was added to
-- migration 0002 *after* 0002 had already been applied to the live DB, so the
-- live schema never received it — every "Lock USDC for cashout" failed with
-- Postgres 42703 (undefined_column), surfacing as a 500 + the opaque
-- "Server Components render" digest on the cashout page. The entire cashout
-- flow was broken in production.
--
-- Idempotent ALTER so this also no-ops on fresh DBs (which already get the
-- column from 0002) and on any other environment carrying the same drift.
-- Matches the 0002 definition: numeric(38,6) not null default 0
-- (0/unset → the code's DEFAULT_DAILY_CASHOUT_CAP_USDC).
alter table vendors
  add column if not exists max_cashout_usdc_daily numeric(38,6) not null default 0;
