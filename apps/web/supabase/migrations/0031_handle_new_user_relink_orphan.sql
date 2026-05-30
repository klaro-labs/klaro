-- Audit 2026-05-30 (HIGH): handle_new_user used `on conflict (email) do nothing`.
-- When an account is deleted but its vendors row persists (orphaned), a re-signup
-- with the same email creates a NEW auth.users row, the trigger's insert
-- conflicts on email and does NOTHING, so the new auth user has no linked
-- vendors row → getSupabaseSession returns null → the user loops back to /signin
-- forever.
--
-- Fix: on email conflict, RE-LINK the existing vendor to the new auth user, but
-- ONLY when the old supabase_user_id no longer exists in auth.users (i.e. the
-- previous account was genuinely deleted / orphaned). This recovers deleted-then-
-- re-created accounts without letting a new signup hijack an ACTIVE account's
-- vendor data via email reuse (if the old user still exists the update is
-- skipped — Supabase already prevents duplicate active identities for one email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_part text;
begin
  if (new.raw_app_meta_data->>'klaro_role') = 'operator' then
    return new;
  end if;

  local_part := split_part(coalesce(new.email, 'vendor'), '@', 1);

  insert into public.vendors (supabase_user_id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(local_part, 'vendor'))
  on conflict (email) do update
    set supabase_user_id = excluded.supabase_user_id
    where vendors.supabase_user_id is distinct from excluded.supabase_user_id
      and not exists (
        select 1 from auth.users u where u.id = vendors.supabase_user_id
      );

  return new;
end;
$$;

-- Trigger definition unchanged; re-assert for idempotency.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
