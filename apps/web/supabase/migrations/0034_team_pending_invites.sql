-- 0034 — allow pending team invites.
-- vendor_team_members.supabase_user_id was NOT NULL, but an invited teammate
-- has no auth user until they accept the invite. Relax it so invites can
-- persist; it's set on acceptance. unique(vendor_id, supabase_user_id) still
-- holds (Postgres treats NULLs as distinct, so multiple pending invites are
-- fine). Additive + idempotent.

alter table public.vendor_team_members alter column supabase_user_id drop not null;
