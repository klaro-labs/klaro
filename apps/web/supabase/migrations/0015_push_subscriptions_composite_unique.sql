-- 0015_push_subscriptions_composite_unique.sql
-- migration 0007 declared
-- `endpoint text not null unique` — a single-column UNIQUE. The route
-- then did `upsert(..., { onConflict: "endpoint" })` against a
-- service-role client that bypasses RLS.
-- Cross-tenant hijack: Vendor B opens DevTools, copies Vendor A's
-- push endpoint string from any leaked source, POSTs to /api/v1/push/
-- subscriptions. The upsert overwrites `vendor_id` to B because the
-- endpoint already exists, and the conflict target was endpoint-only.
-- Every future push notification meant for A's browser now flows to
-- B's browser instead.
-- Fix: drop the single-column unique; replace with a composite unique
-- on (vendor_id, endpoint). Two different vendors can keep separate
-- subscriptions for the same physical endpoint string (which can
-- happen if the same browser is signed in to two demo accounts), and
-- the route's upsert now collapses to a per-vendor-per-endpoint
-- replace instead of a cross-tenant overwrite.

alter table push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

alter table push_subscriptions
  add constraint push_subscriptions_vendor_endpoint_unique
  unique (vendor_id, endpoint);
