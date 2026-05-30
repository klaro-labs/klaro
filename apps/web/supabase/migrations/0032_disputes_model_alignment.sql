-- 0032 — align `disputes` with the DisputeCase app model.
--
-- The 0004 schema stores parties as (kind, id) pairs and has no home for the
-- human-readable labels, opening note, or app-side context the UI renders
-- (DisputeCase.claimantLabel / respondentLabel / openingNote). The live repo
-- (lib/repo/disputes.ts) needs to round-trip those, so add them as nullable
-- columns. Additive + idempotent: existing rows and the daemon's service-role
-- writes are unaffected; `source`/`source_id` keep carrying context/contextRefId.

alter table public.disputes add column if not exists claimant_label text;
alter table public.disputes add column if not exists respondent_label text;
alter table public.disputes add column if not exists opening_note text;

-- dispute_evidence INSERT was never granted to vendor/LP sessions (0004 created
-- SELECT only); evidence currently can only be written service-role. Allow a
-- party to append evidence to a dispute they're scoped to read, matching the
-- read predicate so a vendor/LP can submit on their own case.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dispute_evidence'
      and policyname = 'dispute evidence party insert'
  ) then
    create policy "dispute evidence party insert" on public.dispute_evidence
      for insert to authenticated
      with check (
        exists (
          select 1 from public.disputes d
          where d.id = dispute_id
            and (
              is_admin()
              or (d.claimant_kind = 'vendor' and d.claimant_id::uuid = current_vendor_id())
              or (d.respondent_kind = 'vendor' and d.respondent_id::uuid = current_vendor_id())
              or (d.claimant_kind = 'lp' and is_lp_owner(d.claimant_id::uuid))
              or (d.respondent_kind = 'lp' and is_lp_owner(d.respondent_id::uuid))
            )
        )
      );
  end if;
end $$;
