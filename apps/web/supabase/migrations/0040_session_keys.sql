-- 0040 — persist vendor session-key delegations.
-- The /vendor/delegations create + revoke paths wrote to lib/mockData only, so
-- in live mode an issued delegation silently vanished on cold start (T1
-- honest-mode gap). Persist the delegation RECORD here. NOTE: this is the
-- record only — the Circle Modular Wallet / ERC-6900 on-chain enforcement is
-- partner-pending (CIRCLE_CLIENT_KEY unset), so a stored key does not yet grant
-- the delegate any authority; the UI labels that honestly.

create table if not exists public.session_keys (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.vendors(id) on delete cascade,
  delegate_address  text not null,
  label             text not null,
  scope             text not null,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz
);
create index if not exists session_keys_vendor_idx
  on public.session_keys (vendor_id, created_at desc);

alter table public.session_keys enable row level security;

-- Owning vendor (or admin) may read + write their own delegations. Mirrors the
-- vendor-scope pattern used across the schema.
drop policy if exists "session keys vendor scope" on public.session_keys;
create policy "session keys vendor scope" on public.session_keys
  for all to authenticated
  using (vendor_id = current_vendor_id() or is_admin())
  with check (vendor_id = current_vendor_id() or is_admin());
