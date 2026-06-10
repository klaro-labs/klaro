-- Reconcile the two operator gates.
--
-- The app-level guard `requireOperator()` (lib/auth.ts) trusts
-- `app_metadata.klaro_role = 'operator'`, but the RLS helper `is_admin()` only
-- checked membership in the `admins` table. That table was never populated by
-- operator provisioning, so app-provisioned operators could open /admin/* (app
-- gate passes) yet read ZERO rows from is_admin()-gated tables (disputes, etc.)
-- — the operator console's real-data reads never worked.
--
-- Fix: make `is_admin()` ALSO honor the same `app_metadata.klaro_role='operator'`
-- JWT claim the app guard already trusts. This is additive (the admins-table
-- check is preserved) and safe: `app_metadata` is settable only by the service
-- role, never by the end user, so the claim cannot be forged from the client.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    exists (select 1 from admins where supabase_user_id = auth.uid())
    or coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'klaro_role') = 'operator',
      false
    )
$$;
