-- 0042 — persist vendor FX quotes.
-- The /fx quote + settle paths wrote to lib/mockData only, so in live mode an
-- issued quote (and its settlement) silently vanished on cold start (T1
-- honest-mode gap). Persist the quote RECORD + its status here. NOTE: the FX
-- itself is already labeled honestly on the page (simulated / access pending /
-- live testnet / demo completed) — Circle StableFX (FxEscrow + Permit2) access
-- is partner-pending, so "settlement complete" means the demo flow completed,
-- not an on-chain swap. This migration only stops the records from disappearing.
-- USDC micro-amounts persist as numeric(78,0) and round-trip through BigInt.

create table if not exists public.fx_quotes (
  id              text primary key,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  src_token       text not null,
  dst_token       text not null,
  src_amount_usdc numeric(78, 0) not null,
  dst_amount      numeric(78, 0) not null,
  rate            double precision not null,
  expires_at      timestamptz not null,
  quote_hash      text not null,
  status          text not null,
  created_at      timestamptz not null default now(),
  settled_at      timestamptz
);
create index if not exists fx_quotes_vendor_idx
  on public.fx_quotes (vendor_id, created_at desc);

alter table public.fx_quotes enable row level security;

-- Owning vendor or admin may read + write their own quotes (mirrors the
-- vendor-scope pattern in session_keys 0040 / retainer_streams 0041).
drop policy if exists "fx quotes vendor scope" on public.fx_quotes;
create policy "fx quotes vendor scope" on public.fx_quotes
  for all to authenticated
  using (vendor_id = current_vendor_id() or is_admin())
  with check (vendor_id = current_vendor_id() or is_admin());
