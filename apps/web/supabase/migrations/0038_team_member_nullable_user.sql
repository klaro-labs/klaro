-- 0038 — invited teammates have no Supabase auth user yet.
-- vendor_team_members models an invite lifecycle (invited_at → accepted_at →
-- removed_at), but supabase_user_id was NOT NULL with no default, so every
-- invite insert failed before the teammate ever signed up. Make it nullable;
-- it is populated when the invitee accepts the email link and their auth user
-- is linked to the membership row. Additive + idempotent.

alter table public.vendor_team_members
  alter column supabase_user_id drop not null;
