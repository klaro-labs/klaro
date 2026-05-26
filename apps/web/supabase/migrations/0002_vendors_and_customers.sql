-- Klaro · 0002 vendors + admins + customers
-- Vendor identity, KYB record (hashes only — ), per-vendor limits.

-- ─── admins ─────────────────────────────────────────────────────────
create table if not exists admins (
  id                uuid primary key default gen_random_uuid(),
  supabase_user_id  uuid not null unique references auth.users(id) on delete cascade,
  email             citext not null,
  display_name      text not null,
  role              klaro_role not null default 'admin',
  created_at        timestamptz not null default now()
);

comment on table admins is 'Internal operators. Auth gate for /admin/* + admin-only server actions.';

-- ─── vendors ────────────────────────────────────────────────────────
create table if not exists vendors (
  id                       uuid primary key default gen_random_uuid(),
  supabase_user_id         uuid unique references auth.users(id) on delete set null,
  display_name             text not null,
  email                    citext not null unique,
  country                  text,
  brand_color              text,
  brand_logo_url           text,
  invoice_template_version int not null default 1,

  -- Circle Wallets references — only the wallet address (no PII)
  wallet                   text,                       -- 0x… ERC-20 receive address on Arc
  circle_wallet_id         text,                       -- Circle Wallets server ID
  wallet_provisioned_at    timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists vendors_supabase_user_idx on vendors (supabase_user_id);
create unique index if not exists vendors_wallet_idx on vendors (wallet) where wallet is not null;

drop trigger if exists set_vendors_updated_at on vendors;
create trigger set_vendors_updated_at before update on vendors
  for each row execute function set_updated_at();

-- ─── vendor_team_members (RBAC) ─────────────────────────────────────
create table if not exists vendor_team_members (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references vendors(id) on delete cascade,
  supabase_user_id  uuid not null references auth.users(id) on delete cascade,
  email             citext not null,
  role              klaro_role not null default 'member',
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  removed_at        timestamptz,
  unique (vendor_id, supabase_user_id)
);
create index if not exists team_members_vendor_idx on vendor_team_members (vendor_id) where removed_at is null;

-- ─── vendor_kyb ─────────────────────────────────────────────────────
-- Only hashes on-DB; raw KYB docs live in Supabase Storage (private bucket).
create table if not exists vendor_kyb (
  vendor_id        uuid primary key references vendors(id) on delete cascade,
  status           text not null default 'pending', -- pending|under_review|approved|rejected|revoked
  tier             int not null default 0,           -- 0..4
  kyb_record_hash  text,                              -- keccak of off-chain bundle
  documents_path   text,                              -- supabase storage path
  reviewed_at      timestamptz,
  reviewed_by      uuid references admins(id),
  reason_hash      text,                              -- ReasonCodes.* keccak
  updated_at       timestamptz not null default now()
);
drop trigger if exists set_vendor_kyb_updated_at on vendor_kyb;
create trigger set_vendor_kyb_updated_at before update on vendor_kyb
  for each row execute function set_updated_at();

-- ─── vendor_limits ─────────────────────────────────────────────────
create table if not exists vendor_limits (
  vendor_id              uuid primary key references vendors(id) on delete cascade,
  max_invoice_usdc       numeric(38,6) not null default 0,
  max_cashout_usdc_daily numeric(38,6) not null default 0,
  max_cashout_usdc_total numeric(38,6) not null default 0,
  updated_at             timestamptz not null default now()
);
drop trigger if exists set_vendor_limits_updated_at on vendor_limits;
create trigger set_vendor_limits_updated_at before update on vendor_limits
  for each row execute function set_updated_at();

-- ─── customers (buyers — minimal record, never PII onchain) ─────────
create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors(id) on delete cascade,
  email        citext,
  name         text,
  wallet_hint  text,
  created_at   timestamptz not null default now(),
  unique (vendor_id, email)
);
create index if not exists customers_vendor_idx on customers (vendor_id);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table admins              enable row level security;
alter table vendors             enable row level security;
alter table vendor_team_members enable row level security;
alter table vendor_kyb          enable row level security;
alter table vendor_limits       enable row level security;
alter table customers           enable row level security;

-- Admins: read-only via is_admin(); writes via service-role only.
create policy "admins read self" on admins
  for select using (supabase_user_id = auth.uid() or is_admin());

-- Vendors: a vendor sees own row; admins see all.
create policy "vendor reads own"  on vendors for select using (supabase_user_id = auth.uid() or is_admin());
create policy "vendor updates own" on vendors for update using (supabase_user_id = auth.uid());
-- INSERT happens server-side via service-role; no end-user insert policy.

-- Team members: belong to vendor.
create policy "team reads own vendor" on vendor_team_members
  for select using (vendor_id = current_vendor_id() or supabase_user_id = auth.uid() or is_admin());

-- KYB: vendor reads own; admin reads all + writes (via service-role).
create policy "kyb vendor reads" on vendor_kyb
  for select using (vendor_id = current_vendor_id() or is_admin());

-- Limits: vendor reads own; admin reads + writes via service-role.
create policy "limits vendor reads" on vendor_limits
  for select using (vendor_id = current_vendor_id() or is_admin());

-- Customers: vendor reads own.
create policy "customers vendor scope" on customers
  for all using (vendor_id = current_vendor_id() or is_admin());
