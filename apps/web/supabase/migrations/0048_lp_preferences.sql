-- #14 (build pass 2026-06-02): persist LP notification + corridor toggles.
-- The /lp/settings toggle actions previously threw "lp_preferences_not_yet_
-- shipped" and the page rendered "Coming soon" badges. They now upsert here.
-- Keyed by vendor_id (the LP is 1:1 with a vendor) so RLS is the standard
-- vendor scope rather than a bespoke lp-uuid check.
create table if not exists lp_preferences (
  vendor_id  uuid not null references vendors(id) on delete cascade,
  pref_key   text not null,
  pref_value boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (vendor_id, pref_key)
);
alter table lp_preferences enable row level security;
create policy "lp_preferences vendor scope" on lp_preferences
  for all using (vendor_id = current_vendor_id())
  with check (vendor_id = current_vendor_id());
