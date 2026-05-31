-- 0041 — persist vendor retainer streams.
-- The /vendor/retainer create/withdraw/cancel paths wrote to lib/mockData only,
-- so in live mode a created stream silently vanished on cold start (T1
-- honest-mode gap). Persist the stream RECORD + its vesting accounting here.
-- NOTE: this is the record + a local linear-vesting SIMULATION — the on-chain
-- RetainerStream.createStream() funding leg needs the *client* to sign an
-- approve+fund tx through an accept flow (no payer wallet is present in the
-- single-vendor dashboard), so on-chain custody is partner-pending and the UI
-- labels the vesting as simulated rather than claiming funds lock on-chain.
-- USDC micro-amounts are stored as numeric(78,0) to hold full uint256 range and
-- round-trip cleanly to/from JS bigint as decimal strings.

create table if not exists public.retainer_streams (
  stream_id          text primary key,
  vendor_id          uuid not null references public.vendors(id) on delete cascade,
  payer_label        text not null,
  payer_address      text not null,
  recipient_address  text not null,
  deposit_usdc       numeric(78, 0) not null,
  withdrawn_usdc     numeric(78, 0) not null default 0,
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  cancelled_at       timestamptz,
  cancelled_vested   numeric(78, 0),
  created_at         timestamptz not null default now()
);
create index if not exists retainer_streams_vendor_idx
  on public.retainer_streams (vendor_id, start_at desc);

alter table public.retainer_streams enable row level security;

-- Owning vendor (recipient) or admin may read + write their own streams.
-- Mirrors the vendor-scope pattern used across the schema (see session_keys 0040).
drop policy if exists "retainer streams vendor scope" on public.retainer_streams;
create policy "retainer streams vendor scope" on public.retainer_streams
  for all to authenticated
  using (vendor_id = current_vendor_id() or is_admin())
  with check (vendor_id = current_vendor_id() or is_admin());
