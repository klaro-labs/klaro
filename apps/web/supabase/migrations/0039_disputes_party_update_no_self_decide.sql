-- 0039 — stop a dispute party from self-deciding their own case.
-- 0036's "disputes party update" policy let a party (vendor / LP) update ANY
-- column, so a vendor could send a direct PostgREST update setting
-- status='DECIDED' + a favourable `outcome` on their own dispute. Funds stay
-- safe (the on-chain DisputeManager decision + escrow payout are
-- operator-gated), but it forges the DB mirror and the audit trail.
--
-- Parties only ever legitimately submit evidence (status → EVIDENCE_SUBMITTED).
-- Tighten the WITH CHECK so a non-admin party can only land the dispute in a
-- pre-decision evidence status with no outcome / decided_at set. is_admin()
-- (the operator console) and the service-role daemon (which writes DECIDED on
-- the on-chain Decided event, bypassing RLS) are unaffected. USING is
-- unchanged. Additive + idempotent.

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
    or (
      (
        (claimant_kind   = 'vendor' and claimant_id::uuid   = current_vendor_id())
        or (respondent_kind = 'vendor' and respondent_id::uuid = current_vendor_id())
        or (claimant_kind   = 'lp'     and is_lp_owner(claimant_id::uuid))
        or (respondent_kind = 'lp'     and is_lp_owner(respondent_id::uuid))
      )
      and status in ('OPENED', 'EVIDENCE_REQUESTED', 'EVIDENCE_SUBMITTED')
      -- a fresh dispute defaults outcome to 'PENDING' (the undecided value); a
      -- decided case carries a real outcome enum. Parties may keep it
      -- undecided but never set a decided outcome.
      and (outcome is null or outcome = 'PENDING')
      and decided_at is null
    )
  );
