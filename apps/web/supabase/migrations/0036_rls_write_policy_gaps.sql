-- 0036 — RLS write-policy gaps (audit D6/D7, 2026-05-31).
-- The repos added this milestone write through the RLS-scoped client (tryDb),
-- but three tables had only SELECT/INSERT policies, so the writes silently
-- failed in live mode (mock-mode tests masked it):
--   • vendor_team_members — no INSERT/UPDATE (invite/role/remove broken live)
--   • disputes            — no UPDATE (addEvidence/assignToReview broken live;
--                           decide is daemon/service-role so unaffected)
--   • webhook_deliveries  — no INSERT (test-ping record denied; was swallowed)
-- Each policy mirrors the table's existing SELECT USING clause verbatim so the
-- tenant scoping is identical (no new cross-tenant surface). Additive.

-- ── vendor_team_members: owning vendor (or admin) may invite + mutate ──
drop policy if exists "team vendor insert" on vendor_team_members;
create policy "team vendor insert" on vendor_team_members
  for insert with check (vendor_id = current_vendor_id() or is_admin());

drop policy if exists "team vendor update" on vendor_team_members;
create policy "team vendor update" on vendor_team_members
  for update using (vendor_id = current_vendor_id() or is_admin())
  with check (vendor_id = current_vendor_id() or is_admin());

-- ── disputes: a party (or admin) may advance their own case ──
-- USING/WITH CHECK copy the "disputes scoped" SELECT clause exactly. The
-- ::uuid casts are short-circuited by the kind guards, matching the repo
-- invariant (kind='lp' ⟹ real LP uuid; else system/system).
drop policy if exists "disputes party update" on disputes;
create policy "disputes party update" on disputes
  for update using (
    is_admin()
    or (claimant_kind   = 'vendor' and claimant_id::uuid   = current_vendor_id())
    or (respondent_kind = 'vendor' and respondent_id::uuid = current_vendor_id())
    or (claimant_kind   = 'lp'     and is_lp_owner(claimant_id::uuid))
    or (respondent_kind = 'lp'     and is_lp_owner(respondent_id::uuid))
  ) with check (
    is_admin()
    or (claimant_kind   = 'vendor' and claimant_id::uuid   = current_vendor_id())
    or (respondent_kind = 'vendor' and respondent_id::uuid = current_vendor_id())
    or (claimant_kind   = 'lp'     and is_lp_owner(claimant_id::uuid))
    or (respondent_kind = 'lp'     and is_lp_owner(respondent_id::uuid))
  );

-- ── webhook_deliveries: vendor may record a delivery for a webhook it owns ──
drop policy if exists "deliveries vendor insert" on webhook_deliveries;
create policy "deliveries vendor insert" on webhook_deliveries
  for insert with check (
    exists (
      select 1 from webhooks w
      where w.id = webhook_id and (w.vendor_id = current_vendor_id() or is_admin())
    )
  );
