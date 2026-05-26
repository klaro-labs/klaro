-- 0008_webauthn_credentials.sql
-- `lib/webauthn.ts` client was wired but no
-- server-side routes / table existed, so passkey sign-in was dead.

create table if not exists webauthn_credentials (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references vendors(id) on delete cascade,
  credential_id     bytea not null unique,
  public_key        bytea not null,
  counter           bigint not null default 0,
  transports        text[],
  device_label      text,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz
);

create index if not exists webauthn_credentials_vendor_id_idx on webauthn_credentials(vendor_id);

alter table webauthn_credentials enable row level security;

create policy webauthn_credentials_self_select on webauthn_credentials
  for select to authenticated using (vendor_id = current_vendor_id());

revoke insert, update, delete on webauthn_credentials from authenticated;

-- Short-lived registration/assertion challenges (60s TTL via background cleanup).
create table if not exists webauthn_challenges (
  challenge      text primary key,
  vendor_id      uuid references vendors(id) on delete cascade,
  kind           text not null check (kind in ('register', 'assert')),
  expires_at     timestamptz not null default (now() + interval '5 minutes')
);
create index if not exists webauthn_challenges_expires_idx on webauthn_challenges(expires_at);
alter table webauthn_challenges enable row level security;
revoke select, insert, update, delete on webauthn_challenges from authenticated;
