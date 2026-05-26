-- 0011_kpi_snapshots.sql
-- (2026-05-25): kpiAggregator was log-only; now
-- writes rollups here so /internal/kpi can render real numbers instead of
-- the hardcoded HEADLINE array.

create table if not exists kpi_snapshots (
  id            uuid primary key default gen_random_uuid(),
  window_label  text not null,            -- "1h" | "24h" | "7d"
  invoices      int  not null default 0,
  settled       int  not null default 0,
  cashouts      int  not null default 0,
  taken_at      timestamptz not null default now(),
  unique (window_label, taken_at)
);

create index if not exists kpi_snapshots_taken_at_idx on kpi_snapshots(taken_at desc);

alter table kpi_snapshots enable row level security;

create policy kpi_snapshots_admin_select on kpi_snapshots
  for select to authenticated using (is_admin());

revoke insert, update, delete on kpi_snapshots from authenticated;
