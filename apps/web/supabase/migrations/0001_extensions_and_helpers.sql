-- Klaro · 0001 extensions + reusable helpers
-- Idempotent.

create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "uuid-ossp" with schema "extensions";
create extension if not exists "citext"    with schema "extensions";

-- ─── Shared enum + types ────────────────────────────────────────────

do $$ begin create type klaro_role as enum ('owner','admin','member','readonly'); exception when duplicate_object then null; end $$;
do $$ begin create type klaro_actor_kind as enum ('vendor','admin','lp','system','daemon'); exception when duplicate_object then null; end $$;

-- ─── Timestamp trigger (set_updated_at) ─────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── Auth helpers (resolve current vendor / role) ───────────────────
-- These reference supabase auth schema (auth.uid()) and are safe in RLS policies.

create or replace function current_vendor_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select id from vendors where supabase_user_id = auth.uid() limit 1
$$;

create or replace function is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins where supabase_user_id = auth.uid()
  )
$$;

create or replace function is_lp_owner(lp_uuid uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from lp_profiles
     where id = lp_uuid
       and supabase_user_id = auth.uid()
  )
$$;

comment on function current_vendor_id is 'Returns vendor.id for the auth.uid() caller. Used by RLS.';
comment on function is_admin          is 'True when caller is an admin row. Used by RLS.';
comment on function is_lp_owner       is 'True when caller owns the given LP profile. Used by RLS.';
