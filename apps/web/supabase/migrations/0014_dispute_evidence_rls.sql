-- Klaro · 0014 — dispute_evidence RLS bypass fix.
-- Audit fix — caught by 's parallel
-- database-reviewer subagent, deferred until now.
-- The 0004 migration created this policy:
-- create policy "dispute evidence scoped" on dispute_evidence for select using (
-- exists (select 1 from disputes d where d.id = dispute_id)
-- );
-- The inline comment "-- relies on disputes RLS" is wrong: RLS on the
-- `disputes` table does NOT cascade into subqueries from other tables'
-- policies. The `exists` check only verifies that a matching parent row
-- exists (always true for valid FK), not that the caller is party to it.
-- Result: any authenticated session could SELECT every dispute_evidence
-- row across every tenant — full cross-tenant evidence leak.
-- Fix: mirror the disputes policy's scoping (admin OR vendor party OR LP
-- party) inside the dispute_evidence subquery so the predicate evaluates
-- the same way regardless of which table owns the policy.

drop policy if exists "dispute evidence scoped" on dispute_evidence;

create policy "dispute evidence scoped"
  on dispute_evidence
  for select
  using (
    exists (
      select 1 from disputes d
       where d.id = dispute_id
         and (
              is_admin()
           or (d.claimant_kind  = 'vendor' and d.claimant_id::uuid   = current_vendor_id())
           or (d.respondent_kind = 'vendor' and d.respondent_id::uuid = current_vendor_id())
           or (d.claimant_kind  = 'lp'     and is_lp_owner(d.claimant_id::uuid))
           or (d.respondent_kind = 'lp'     and is_lp_owner(d.respondent_id::uuid))
         )
    )
  );

-- Belt-and-suspenders: ensure RLS stays enabled on the table.
alter table dispute_evidence enable row level security;
