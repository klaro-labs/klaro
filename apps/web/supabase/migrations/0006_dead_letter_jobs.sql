-- 0006_dead_letter_jobs.sql
-- every prior .add() ran with BullMQ defaults
-- (1 attempt, no backoff). After the queue wrapper applies DEFAULT_JOB_OPTS,
-- jobs that exhaust all 5 attempts land here for operator triage. The
-- workers/_dlq.ts worker drains BullMQ's `failed` set into this table and
-- raises PagerDuty when backlog exceeds the alert threshold.

create table if not exists dead_letter_jobs (
  id              uuid primary key default gen_random_uuid(),
  queue_name      text not null,
  job_id          text,                       -- BullMQ job id (may be null if not set)
  job_name        text,                       -- semantic name (e.g. "invoice.settled")
  payload         jsonb not null,
  failed_reason   text not null,
  attempts_made   int  not null,
  failed_at       timestamptz not null default now(),
  acknowledged_at timestamptz,                -- set when operator marks "looked at"
  acknowledged_by uuid references admins(id),
  resolution_note text
);

create index if not exists dead_letter_jobs_queue_idx       on dead_letter_jobs(queue_name);
create index if not exists dead_letter_jobs_unack_failed_at on dead_letter_jobs(failed_at desc)
  where acknowledged_at is null;

alter table dead_letter_jobs enable row level security;

-- Admin-only reads / acks.
create policy dead_letter_admin_select on dead_letter_jobs
  for select to authenticated using (is_admin());

create policy dead_letter_admin_ack on dead_letter_jobs
  for update to authenticated using (is_admin()) with check (is_admin());

revoke insert, delete on dead_letter_jobs from authenticated;
