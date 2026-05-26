-- Klaro · 0005 ERP sync · webhooks · audit_log · agents

-- ─── erp_connections ───────────────────────────────────────────────
create table if not exists erp_connections (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors(id) on delete cascade,
  provider        text not null,                  -- tally | quickbooks | xero | zoho | myob | freee
  status          text not null default 'pending', -- pending | active | error | revoked
  auth_token_ciphertext text,                      -- pgp_sym_encrypted
  config_json     jsonb not null default '{}'::jsonb,
  last_sync_at    timestamptz,
  health_md       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vendor_id, provider)
);
create index if not exists erp_connections_vendor_idx on erp_connections (vendor_id);
drop trigger if exists set_erp_connections_updated_at on erp_connections;
create trigger set_erp_connections_updated_at before update on erp_connections
  for each row execute function set_updated_at();

-- ─── erp_sync_jobs (BullMQ mirror + DLQ) ───────────────────────────
create table if not exists erp_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors(id) on delete cascade,
  provider        text not null,
  invoice_id      text references invoices(id) on delete set null,
  kind            text not null,                  -- invoice.create | invoice.pay | tax_pack | …
  status          text not null default 'queued', -- queued | running | success | failed | dead_letter
  attempts        int not null default 0,
  last_error      text,
  idempotency_key text not null,
  payload_json    jsonb not null,
  enqueued_at     timestamptz not null default now(),
  completed_at    timestamptz,
  unique (vendor_id, provider, idempotency_key)
);
create index if not exists erp_jobs_status_idx on erp_sync_jobs (status, enqueued_at);

-- ─── webhooks (vendor-registered outbound) ─────────────────────────
create table if not exists webhooks (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id) on delete cascade,
  url           text not null,
  events        text[] not null,                  -- ['invoice.paid','cashout.released',…]
  secret_ciphertext text not null,                -- pgp_sym_encrypted vendor-shared HMAC secret
  status        text not null default 'active',   -- active | paused | deleted
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists webhooks_vendor_idx on webhooks (vendor_id) where status = 'active';
drop trigger if exists set_webhooks_updated_at on webhooks;
create trigger set_webhooks_updated_at before update on webhooks
  for each row execute function set_updated_at();

-- ─── webhook_deliveries ────────────────────────────────────────────
create table if not exists webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references webhooks(id) on delete cascade,
  event           text not null,
  payload_json    jsonb not null,
  status          text not null default 'queued', -- queued | success | failed | dead_letter
  attempts        int not null default 0,
  last_error      text,
  last_attempt_at timestamptz,
  delivered_at    timestamptz,
  idempotency_key text not null,
  unique (webhook_id, idempotency_key)
);
create index if not exists deliveries_webhook_idx on webhook_deliveries (webhook_id, status);

-- ─── audit_logs (every operator + vendor mutating action) ──────────
-- noteMd is dropped on Sentry mirror per ; kept here for full traceability.
create table if not exists audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_kind     klaro_actor_kind not null,
  actor_id       text not null,
  action         text not null,                  -- ReasonCodes-aligned label
  subject_kind   text not null,                  -- vendor|invoice|cashout|lp|dispute|contract|...
  subject_id     text not null,
  reason_hash    text,
  evidence_hash  text,
  note_md        text,
  runbook_id     text,
  ip_hash        text,
  ua_hash        text,
  at             timestamptz not null default now()
);
create index if not exists audit_actor_idx   on audit_logs (actor_kind, actor_id, at desc);
create index if not exists audit_subject_idx on audit_logs (subject_kind, subject_id, at desc);
create index if not exists audit_action_idx  on audit_logs (action, at desc);

-- ─── agent_wallets ──────────────────────────────────────────────────
create table if not exists agent_wallets (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors(id) on delete cascade,
  agent_id        text not null,                  -- on-chain bytes32 hex
  wallet          text not null,
  policy_caps     jsonb not null default '{}'::jsonb, -- per-tx, daily, weekly, monthly USDC
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vendor_id, agent_id)
);
drop trigger if exists set_agent_wallets_updated_at on agent_wallets;
create trigger set_agent_wallets_updated_at before update on agent_wallets
  for each row execute function set_updated_at();

-- ─── agent_jobs ─────────────────────────────────────────────────────
do $$ begin
  create type agent_job_status as enum ('CREATED','FUNDED','STARTED','DELIVERED','CLOSED','DISPUTED','CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists agent_jobs (
  id                uuid primary key default gen_random_uuid(),
  job_id            text not null unique,           -- on-chain bytes32 hex
  vendor_id         uuid not null references vendors(id) on delete restrict,
  agent_id          text not null,
  agent_wallet      text not null,
  amount_usdc       numeric(38,6) not null,
  fee_usdc          numeric(38,6) not null,
  status            agent_job_status not null default 'CREATED',
  deliverable_hash  text,
  created_at        timestamptz not null default now(),
  funded_at         timestamptz,
  started_at        timestamptz,
  delivered_at      timestamptz,
  closed_at         timestamptz
);
create index if not exists jobs_vendor_idx on agent_jobs (vendor_id, created_at desc);
create index if not exists jobs_status_idx on agent_jobs (status);

-- ─── push_subscriptions (Web Push) ─────────────────────────────────
create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  supabase_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  unique (supabase_user_id, endpoint)
);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table erp_connections    enable row level security;
alter table erp_sync_jobs      enable row level security;
alter table webhooks           enable row level security;
alter table webhook_deliveries enable row level security;
alter table audit_logs         enable row level security;
alter table agent_wallets      enable row level security;
alter table agent_jobs         enable row level security;
alter table push_subscriptions enable row level security;

create policy "erp connections vendor scope" on erp_connections for all using (vendor_id = current_vendor_id() or is_admin());
create policy "erp jobs vendor scope"        on erp_sync_jobs   for all using (vendor_id = current_vendor_id() or is_admin());
create policy "webhooks vendor scope"        on webhooks        for all using (vendor_id = current_vendor_id() or is_admin());
create policy "deliveries vendor scope"      on webhook_deliveries for select using (
  exists (select 1 from webhooks w where w.id = webhook_id and (w.vendor_id = current_vendor_id() or is_admin()))
);

-- Audit log: admins read all; vendors read entries they're the subject of.
create policy "audit admin reads all" on audit_logs for select using (
  is_admin() or (subject_kind = 'vendor' and subject_id::uuid = current_vendor_id())
);

create policy "agent wallets vendor scope" on agent_wallets for all using (vendor_id = current_vendor_id() or is_admin());
create policy "agent jobs vendor scope"    on agent_jobs    for all using (vendor_id = current_vendor_id() or is_admin());

create policy "push subs self" on push_subscriptions for all using (supabase_user_id = auth.uid());
