-- Klaro · 0019 sanctions_refresh_runs audit table
--
-- The sanctionsRefresh worker runs in simulated mode until Chainalysis / TRM
-- credentials are wired. Without this table the only proof a cron tick fired
-- was a stdout log line — useless on serverless cold restarts. One row per
-- cron tick gives the operator a SQL-queryable answer to "did sanctions
-- refresh run last night?"

create table if not exists sanctions_refresh_runs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,           -- 'OFAC' | 'EU' | 'UN' | (future provider)
  status      text not null,           -- 'simulated' | 'success' | 'failed'
  reason      text,                    -- free-form note (especially when status='simulated')
  ran_at      timestamptz not null default now(),
  finished_at timestamptz,
  detail      jsonb                    -- future: list-diff count, fetch latency, etc
);

create index if not exists sanctions_refresh_runs_recent_idx
  on sanctions_refresh_runs (ran_at desc);

alter table sanctions_refresh_runs enable row level security;

create policy sanctions_refresh_runs_admin_select on sanctions_refresh_runs
  for select to authenticated using (is_admin());

revoke insert, update, delete on sanctions_refresh_runs from authenticated;

comment on table sanctions_refresh_runs is
  'Iter 98 F3: per-cron-tick audit row so operators can answer "did sanctions cron fire?" via SQL instead of stdout grep.';
