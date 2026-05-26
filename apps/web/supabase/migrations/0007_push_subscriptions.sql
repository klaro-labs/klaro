-- 0007_push_subscriptions.sql
-- `lib/push.ts` POSTed to a /api/v1/push/subscriptions
-- route that did not exist. The client subscribe call silently failed and no
-- notification ever arrived. This table backs the new route + the daemon's
-- NotificationWorker uses it to look up endpoints per vendor.

-- (2026-05-26): drops the 0005 stub (different schema) and recreates.
-- FK type fixed to uuid — vendors.id is uuid; current_vendor_id() returns uuid;
-- text would have failed at CREATE TABLE time.
drop table if exists push_subscriptions cascade;

create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references vendors(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent_hash text,
  created_at      timestamptz not null default now()
);

create index if not exists push_subscriptions_vendor_id_idx on push_subscriptions(vendor_id);

alter table push_subscriptions enable row level security;

-- Vendor reads own subscriptions; insert/delete via service-role only so the
-- client must go through the API route (which derives vendor_id from session).
create policy push_subs_self_select on push_subscriptions
  for select to authenticated using (vendor_id = current_vendor_id());

revoke insert, update, delete on push_subscriptions from authenticated;
