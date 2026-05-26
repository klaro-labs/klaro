-- 0010_lp_members.sql
-- Maps Klaro vendor (auth.users) → LP (lp_profiles) so LP actions can derive the
-- LP from the session instead of picking the first row in the table. Audit
-- finding #1 (2026-05-25): every signed-in vendor could submit KYB / stake /
-- claim orders as the first LP because `_firstLP()` ignored identity.
-- Role semantics (mirrors team_member roles):
-- owner — can mutate KYB, stake, exit
-- operator — can claim orders, submit proofs, open disputes
-- viewer — dashboard read only

create table if not exists lp_members (
  id          uuid primary key default gen_random_uuid(),
  lp_id       uuid not null references lp_profiles(id) on delete cascade,
  vendor_id   uuid not null references vendors(id) on delete cascade,
  role        text not null check (role in ('owner', 'operator', 'viewer')),
  created_at  timestamptz not null default now(),
  unique (lp_id, vendor_id)
);

create index if not exists lp_members_vendor_id_idx on lp_members(vendor_id);
create index if not exists lp_members_lp_id_idx     on lp_members(lp_id);

alter table lp_members enable row level security;

-- Vendor sees only the rows linking them to an LP.
create policy lp_members_self_select on lp_members
  for select to authenticated
  using (vendor_id = current_vendor_id());

-- Mutations go through service-role (operator-driven LP onboarding).
revoke insert, update, delete on lp_members from authenticated;
