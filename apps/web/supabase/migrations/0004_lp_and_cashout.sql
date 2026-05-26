-- Klaro · 0004 LPs · cashout orders · proofs · disputes

-- ─── lp_profiles ───────────────────────────────────────────────────
do $$ begin
  create type lp_status as enum ('INVITED','APPLIED','UNDER_REVIEW','APPROVED','STAKED','SUSPENDED','REVOKED');
exception when duplicate_object then null; end $$;

create table if not exists lp_profiles (
  id                  uuid primary key default gen_random_uuid(),
  lp_id               text not null unique,          -- on-chain bytes32 hex
  supabase_user_id    uuid references auth.users(id) on delete set null,
  contact_email       citext not null,
  legal_entity_name   text,
  country             text,
  wallet              text,                           -- USDC payout destination
  tier                int not null default 0,
  status              lp_status not null default 'INVITED',
  kyb_record_hash     text,
  payout_account_hash text,
  documents_path      text,
  invited_at          timestamptz not null default now(),
  approved_at         timestamptz,
  staked_usdc         numeric(38,6) not null default 0,
  active_exposure_usdc numeric(38,6) not null default 0,
  last_reason_hash    text,
  updated_at          timestamptz not null default now()
);
create index if not exists lp_profiles_status_idx on lp_profiles (status);
create index if not exists lp_profiles_email_idx  on lp_profiles (contact_email);

drop trigger if exists set_lp_profiles_updated_at on lp_profiles;
create trigger set_lp_profiles_updated_at before update on lp_profiles
  for each row execute function set_updated_at();

-- ─── lp_kyb (separate so RLS can be tighter) ───────────────────────
create table if not exists lp_kyb (
  lp_id             text primary key references lp_profiles(lp_id) on delete cascade,
  bundle_hash       text not null,
  reviewed_by       uuid references admins(id),
  reviewed_at       timestamptz,
  outcome           text,                            -- approved | rejected | hold
  reason_hash       text,
  documents_path    text,
  updated_at        timestamptz not null default now()
);
drop trigger if exists set_lp_kyb_updated_at on lp_kyb;
create trigger set_lp_kyb_updated_at before update on lp_kyb
  for each row execute function set_updated_at();

-- ─── lp_limits ─────────────────────────────────────────────────────
create table if not exists lp_limits (
  lp_id                 text primary key references lp_profiles(lp_id) on delete cascade,
  per_order_max_usdc    numeric(38,6) not null default 0,
  daily_max_usdc        numeric(38,6) not null default 0,
  active_exposure_cap   numeric(38,6) not null default 0,
  updated_at            timestamptz not null default now()
);
drop trigger if exists set_lp_limits_updated_at on lp_limits;
create trigger set_lp_limits_updated_at before update on lp_limits
  for each row execute function set_updated_at();

-- ─── lp_stakes (mirror of on-chain LPStaking) ──────────────────────
create table if not exists lp_stakes (
  id              uuid primary key default gen_random_uuid(),
  lp_id           text not null references lp_profiles(lp_id) on delete cascade,
  amount_usdc     numeric(38,6) not null,
  staked_at       timestamptz not null default now(),
  unstake_after   timestamptz,
  slashed_amount  numeric(38,6) not null default 0,
  slash_reason    text
);
create index if not exists lp_stakes_lp_idx on lp_stakes (lp_id, staked_at desc);

-- ─── lp_reputation ─────────────────────────────────────────────────
create table if not exists lp_reputation (
  lp_id              text primary key references lp_profiles(lp_id) on delete cascade,
  score              int not null default 700,
  orders_completed   int not null default 0,
  disputes_opened    int not null default 0,
  disputes_lost      int not null default 0,
  median_minutes     int,
  last_calc_at       timestamptz not null default now()
);

-- ─── cashout_orders ────────────────────────────────────────────────
do $$ begin
  create type cashout_status as enum (
    'REQUESTED','LOCKED','CLAIMED','PROOF_SUBMITTED','CONFIRMED','RELEASED',
    'DISPUTED','RESOLVED_LP_PAYS','RESOLVED_VENDOR_PAYS','EXPIRED','CANCELLED'
  );
exception when duplicate_object then null; end $$;

create table if not exists cashout_orders (
  id                 text primary key,                 -- on-chain bytes32 hex
  vendor_id          uuid not null references vendors(id) on delete restrict,
  vendor_wallet      text not null,
  usdc_amount        numeric(38,6) not null,
  payout_minor       numeric(38,0) not null,           -- currency × 100
  currency           text not null,                    -- ISO code (INR, …)
  klaro_fee_usdc     numeric(38,6) not null,
  lp_spread_usdc     numeric(38,6) not null,
  quote_rate         numeric(20,6) not null,
  quote_hash         text not null,
  status             cashout_status not null default 'REQUESTED',
  lp_id              text references lp_profiles(lp_id) on delete set null,
  lp_name            text,
  proof_hash         text,
  utr_reference      text,
  requested_at       timestamptz not null default now(),
  quote_expires_at   timestamptz not null,
  resolved_at        timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists cashouts_vendor_idx on cashout_orders (vendor_id, requested_at desc);
create index if not exists cashouts_status_idx on cashout_orders (status);
create index if not exists cashouts_lp_idx     on cashout_orders (lp_id) where lp_id is not null;

drop trigger if exists set_cashouts_updated_at on cashout_orders;
create trigger set_cashouts_updated_at before update on cashout_orders
  for each row execute function set_updated_at();

-- ─── cashout_quotes (immutable history) ────────────────────────────
create table if not exists cashout_quotes (
  id                uuid primary key default gen_random_uuid(),
  quote_hash        text not null unique,
  vendor_id         uuid not null references vendors(id) on delete cascade,
  usdc_amount       numeric(38,6) not null,
  payout_minor      numeric(38,0) not null,
  currency          text not null,
  klaro_fee_usdc    numeric(38,6) not null,
  lp_spread_usdc    numeric(38,6) not null,
  quote_rate        numeric(20,6) not null,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
create index if not exists quotes_vendor_idx on cashout_quotes (vendor_id, created_at desc);

-- ─── payout_proofs (mirror of on-chain ProofRegistry) ──────────────
create table if not exists payout_proofs (
  id              uuid primary key default gen_random_uuid(),
  order_id        text not null references cashout_orders(id) on delete cascade,
  proof_hash      text not null,                     -- keccak of UTR + screenshot + timestamps
  utr_reference   text,
  bank_method     text,                              -- IMPS | UPI | NEFT | RTGS | …
  screenshot_path text,                              -- supabase storage
  submitted_at    timestamptz not null default now()
);
create index if not exists proofs_order_idx on payout_proofs (order_id);

-- ─── disputes (mirror of DisputeManager) ───────────────────────────
do $$ begin
  create type dispute_outcome as enum (
    'PENDING','RELEASE_TO_CLAIMANT','REFUND_TO_RESPONDENT',
    'ASK_MORE_EVIDENCE','SLASH_LP','PENALIZE_VENDOR','CANCELLED'
  );
exception when duplicate_object then null; end $$;

create table if not exists disputes (
  id                 uuid primary key default gen_random_uuid(),
  case_id            text not null unique,               -- on-chain bytes32 hex
  source             text not null,                       -- 'cashout' | 'agent' | 'retainer'
  source_id          text not null,                       -- order id / job id / stream id
  claimant_kind      klaro_actor_kind not null,
  claimant_id        text not null,
  respondent_kind    klaro_actor_kind not null,
  respondent_id      text not null,
  amount_usdc        numeric(38,6),
  opening_evidence_hash text,
  status             text not null default 'OPENED',     -- OPENED|EVIDENCE_REQUESTED|UNDER_REVIEW|DECIDED|CLOSED
  outcome            dispute_outcome not null default 'PENDING',
  decision_reason_hash text,
  evidence_path      text,
  opened_at          timestamptz not null default now(),
  decided_at         timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists disputes_status_idx on disputes (status);
create index if not exists disputes_source_idx on disputes (source, source_id);

drop trigger if exists set_disputes_updated_at on disputes;
create trigger set_disputes_updated_at before update on disputes
  for each row execute function set_updated_at();

-- ─── dispute_evidence (chronological items per case) ───────────────
create table if not exists dispute_evidence (
  id            uuid primary key default gen_random_uuid(),
  dispute_id    uuid not null references disputes(id) on delete cascade,
  submitter_kind klaro_actor_kind not null,
  submitter_id   text not null,
  body_md        text,
  attachment_path text,
  attachment_hash text,
  submitted_at   timestamptz not null default now()
);
create index if not exists evidence_dispute_idx on dispute_evidence (dispute_id, submitted_at);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table lp_profiles      enable row level security;
alter table lp_kyb           enable row level security;
alter table lp_limits        enable row level security;
alter table lp_stakes        enable row level security;
alter table lp_reputation    enable row level security;
alter table cashout_orders   enable row level security;
alter table cashout_quotes   enable row level security;
alter table payout_proofs    enable row level security;
alter table disputes         enable row level security;
alter table dispute_evidence enable row level security;

-- LPs see their own profile; admins see all; claimable orders are public to staked LPs (gated server-side).
create policy "lp owns profile"      on lp_profiles      for all    using (supabase_user_id = auth.uid() or is_admin());
create policy "lp owns kyb"          on lp_kyb           for select using (is_lp_owner(lp_kyb.lp_id::uuid) or is_admin());
create policy "lp owns limits"       on lp_limits        for select using (is_lp_owner(lp_limits.lp_id::uuid) or is_admin());
create policy "lp owns stakes"       on lp_stakes        for select using (is_lp_owner(lp_stakes.lp_id::uuid) or is_admin());
create policy "lp owns reputation"   on lp_reputation    for select using (is_lp_owner(lp_reputation.lp_id::uuid) or is_admin());

-- Cashouts: vendor sees own; admin sees all; LP sees orders they're assigned to.
create policy "cashout vendor scope" on cashout_orders for all using (vendor_id = current_vendor_id() or is_admin());
create policy "cashout lp scope"     on cashout_orders for select using (lp_id is not null and is_lp_owner(lp_id::uuid));

-- Quotes: vendor only.
create policy "quotes vendor scope" on cashout_quotes for all using (vendor_id = current_vendor_id() or is_admin());

-- Proofs: tied to order RLS — only assigned LP + vendor + admin.
create policy "proofs scoped" on payout_proofs for select using (
  exists (select 1 from cashout_orders o where o.id = order_id
            and (o.vendor_id = current_vendor_id()
              or (o.lp_id is not null and is_lp_owner(o.lp_id::uuid))
              or is_admin()))
);

-- Disputes: claimant + respondent + admin see the case.
create policy "disputes scoped" on disputes for select using (
  is_admin()
  or (claimant_kind  = 'vendor' and claimant_id::uuid  = current_vendor_id())
  or (respondent_kind = 'vendor' and respondent_id::uuid = current_vendor_id())
  or (claimant_kind  = 'lp'     and is_lp_owner(claimant_id::uuid))
  or (respondent_kind = 'lp'     and is_lp_owner(respondent_id::uuid))
);
create policy "dispute evidence scoped" on dispute_evidence for select using (
  exists (select 1 from disputes d where d.id = dispute_id)  -- relies on disputes RLS
);
