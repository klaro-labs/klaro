-- Iter 105 follow-ups from supabase security advisor:
-- 1. Pin search_path on set_updated_at (was mutable).
-- 2. Revoke EXECUTE on handle_new_user from anon/authenticated — it is a
--    trigger function, never meant to be RPC-callable.
-- 3. Keep current_vendor_id / is_admin / is_lp_owner as SECURITY DEFINER +
--    executable by authenticated: RLS policies invoke them with the caller's
--    role, so revoking EXECUTE would break RLS. Each returns only info the
--    caller already has (their own vendor_id / their own role / whether they
--    own a specific lp_profile). RPC enumeration via is_lp_owner is bounded
--    to a uuid the caller already knows.
-- 4. webauthn_challenges: keep RLS on with no policy. All four DML privileges
--    are already revoked from authenticated; service-role bypasses RLS by
--    design. The advisor INFO is intentional, not a defect.

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;
