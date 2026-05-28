-- Klaro · 0021 contact_submissions
--
-- Real backing store for the /company/contact form. Replaces the prototype's
-- `alert("Thanks")`. Insert-only from the public-form route (anon JWT via
-- service-role on the server). Reads are operator-only — vendors must never
-- enumerate each other's submissions.

create table if not exists contact_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  company     text,
  message     text not null,
  source      text not null default 'web_contact_form',
  user_agent  text,
  ip_hash     text,                 -- truncated sha-256, no raw IP (§11 no-PII-onchain spirit)
  created_at  timestamptz not null default now()
);

create index if not exists contact_submissions_recent_idx
  on contact_submissions (created_at desc);

alter table contact_submissions enable row level security;

create policy contact_submissions_admin_select on contact_submissions
  for select to authenticated using (is_admin());

-- Writes happen via service-role from the server route; no anon/authenticated
-- inserts. Deletes/updates are operator-only and rare (GDPR erasure).
revoke insert, update, delete on contact_submissions from authenticated, anon;

create policy contact_submissions_admin_delete on contact_submissions
  for delete to authenticated using (is_admin());

comment on table contact_submissions is
  'Submissions from /company/contact. Insert via service-role server route, read by operators only.';
