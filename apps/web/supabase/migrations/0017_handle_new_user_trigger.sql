-- Klaro · 0017 handle_new_user trigger (auth.users → vendors auto-provision)
-- strictened getSupabaseSession to refuse
-- a session when no vendors row links to the auth.uid. Without a corresponding
-- post-signup trigger, every brand-new user landed on /vendor → session = null
-- → redirected to /signin → infinite loop. The signin copy promised "An
-- account is created automatically when you sign in for the first time" — this
-- migration is what makes that promise true.
-- The trigger fires AFTER auth.users INSERT and creates a minimal vendors row:
-- - supabase_user_id linked to auth.uid
-- - email copied from auth.users.email (vendor can update later)
-- - display_name defaults to the email's local-part (vendor edits in settings)
-- - country / wallet / brand fields stay null until vendor provisions them
-- Idempotent: if the row already exists (e.g. server-side onboarding raced ahead),
-- the ON CONFLICT DO NOTHING absorbs the duplicate.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_part text;
begin
  -- F-3 (web audit): skip auto-provision for operator-role
  -- users. Operators have an `admins` row (migration 0002:5) provisioned
  -- by the operator-onboarding flow; auto-creating a vendors row for
  -- them pollutes vendor-count / billing / KYB queries with non-tenant
  -- records.
  if (new.raw_app_meta_data->>'klaro_role') = 'operator' then
    return new;
  end if;

  -- Email is always present for password / OAuth / magic-link signups on Supabase.
  -- Derive a starter display_name from the local-part so the vendor sees their
  -- own name in the UI before they reach /vendor/settings.
  local_part := split_part(coalesce(new.email, 'vendor'), '@', 1);

  insert into public.vendors (supabase_user_id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(local_part, 'vendor'))
  on conflict (email) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

comment on function public.handle_new_user is
  'Iter 92 F1: auto-provision a vendors row when a Supabase auth user is created. Required for getSupabaseSession (iter 91 W89-1) — without this, every first-time signup loops back to /signin.';
