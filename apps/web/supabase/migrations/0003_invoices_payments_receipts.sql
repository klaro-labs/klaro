-- Klaro · 0003 invoices · payment routes · screening · receipts

-- ─── invoices ──────────────────────────────────────────────────────
do $$ begin
  create type invoice_status as enum ('CREATED','ACCEPTED','PAID','SETTLED','REFUNDED','CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists invoices (
  id               text primary key,                 -- on-chain bytes32 hex (with 0x)
  vendor_id        uuid not null references vendors(id) on delete restrict,
  customer_id      uuid references customers(id) on delete set null,

  -- Customer snapshot (vendor controls what's revealed publicly per privacy mode)
  customer_email   citext,
  customer_name    text,

  amount_usdc      numeric(38,6) not null,           -- 6-dec USDC ERC-20 amount
  token            text not null,                    -- Arc USDC erc-20 by default
  due_at           timestamptz not null,
  notes_md         text,
  privacy_mode     text not null default 'public',   -- public | hide_amount | hide_customer
  status           invoice_status not null default 'CREATED',
  metadata_hash    text not null,                    -- keccak256 of off-chain JSON
  splits_hash      text,                              -- keccak256 of splits[] if multi-payee
  acceptance_sig   text,
  accepted_by      text,
  accepted_at      timestamptz,
  paid_tx_hash     text,
  settled_tx_hash  text,
  receipt_hash     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists invoices_vendor_idx        on invoices (vendor_id, created_at desc);
create index if not exists invoices_status_idx        on invoices (status);
create index if not exists invoices_accepted_by_idx   on invoices (accepted_by) where accepted_by is not null;
create index if not exists invoices_receipt_idx       on invoices (receipt_hash) where receipt_hash is not null;

drop trigger if exists set_invoices_updated_at on invoices;
create trigger set_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

-- ─── invoice_line_items ────────────────────────────────────────────
create table if not exists invoice_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   text not null references invoices(id) on delete cascade,
  description  text not null,
  amount_usdc  numeric(38,6) not null,
  position     int not null default 0
);
create index if not exists line_items_invoice_idx on invoice_line_items (invoice_id, position);

-- ─── payment_routes ─────────────────────────────────────────────────
-- Tracks cross-chain payment intent / settlement route
create table if not exists payment_routes (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        text not null references invoices(id) on delete cascade,
  route_kind        text not null,         -- direct-arc | cctp-v2 | gateway-batched | appkit-bridge | card-moonpay
  source_chain      text,                  -- arc | base | ethereum | polygon | solana | …
  destination_chain text default 'arc',
  bridge_intent_id  text,
  attestation_hash  text,
  source_tx_hash    text,
  arc_tx_hash       text,
  state             text not null default 'pending', -- pending | burning | attesting | minting | settled | refunded | failed
  state_detail      text,
  started_at        timestamptz not null default now(),
  settled_at        timestamptz
);
create index if not exists payment_routes_invoice_idx on payment_routes (invoice_id);

-- ─── screening_results ──────────────────────────────────────────────
-- 3-of-3 (sanctions, behavioral, KYB-liveness)
create table if not exists screening_results (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      text not null references invoices(id) on delete cascade,
  buyer_address   text not null,
  provider        text not null,           -- chainalysis | trm | elliptic | klaro-behavioral | sumsub
  result          text not null,           -- pass | fail | review
  evidence_hash   text not null,
  detail_md       text,
  ran_at          timestamptz not null default now()
);
create index if not exists screening_invoice_idx on screening_results (invoice_id);
create index if not exists screening_buyer_idx   on screening_results (buyer_address);

-- ─── counterparty_screen_cache (mirror of on-chain CounterpartyRegistry) ──
-- (2026-05-26): PG rejected `(text || text)::interval` in a STORED
-- generated column (not immutable). `timestamptz + interval` is STABLE, so an
-- expression index on the sum fails too. Cleanup queries compute
-- `decided_at + (ttl_seconds * interval '1 second')` inline; the plain index
-- on decided_at gives the oldest-first seek the worker needs.
create table if not exists counterparty_screen_cache (
  buyer_address  text primary key,
  bundle_hash    text not null,            -- keccak of 3-of-3 result bundle
  decided_at     timestamptz not null,
  ttl_seconds    int not null default 86400
);
create index if not exists screen_cache_decided_idx on counterparty_screen_cache (decided_at);

-- ─── receipts ───────────────────────────────────────────────────────
create table if not exists receipts (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        text not null references invoices(id) on delete cascade,
  receipt_hash      text not null unique,
  invoice_hash      text not null,
  acceptance_hash   text,
  screening_hash    text,
  settlement_tx     text not null,
  settled_at        timestamptz not null,
  source_chain_id   int,
  pdf_storage_path  text,
  reveal_amount     boolean not null default true,
  reveal_customer   boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists receipts_invoice_idx on receipts (invoice_id);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table invoices                   enable row level security;
alter table invoice_line_items         enable row level security;
alter table payment_routes             enable row level security;
alter table screening_results          enable row level security;
alter table counterparty_screen_cache  enable row level security;
alter table receipts                   enable row level security;

-- Invoices: vendor sees own; buyer (acceptedBy) sees own invoices by walking from /i/[id]; receipt public path uses anon read by hash.
create policy "invoices vendor read"   on invoices for select using (vendor_id = current_vendor_id() or is_admin());
create policy "invoices public by id"  on invoices for select using (true);  -- /i/[id] is public; service-role writes
-- (Public read OK — invoice has no PII beyond customer email which vendor controls per privacy_mode.)

create policy "line items inherit invoice" on invoice_line_items
  for select using (exists (select 1 from invoices i where i.id = invoice_id and (i.vendor_id = current_vendor_id() or is_admin() or true)));

create policy "payment routes vendor read" on payment_routes
  for select using (exists (select 1 from invoices i where i.id = invoice_id and (i.vendor_id = current_vendor_id() or is_admin())));

create policy "screening vendor read" on screening_results
  for select using (exists (select 1 from invoices i where i.id = invoice_id and (i.vendor_id = current_vendor_id() or is_admin())));

-- Counterparty cache: admins + daemon only (never user-readable).
create policy "screen cache admin only" on counterparty_screen_cache for select using (is_admin());

-- Receipts: PUBLIC read by hash (designed to be shareable).
create policy "receipts public read" on receipts for select using (true);
