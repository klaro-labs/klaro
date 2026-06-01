-- C1 (launch audit 2026-06-01): in live mode a staked LP's UI claim of a cashout
-- silently STRANDS. The LP-claim path (app/lp/actions.ts -> advanceCashout) uses
-- the RLS-respecting client, but the only UPDATE policy on cashout_orders is
-- vendor-scoped (0021: vendor_id = current_vendor_id()). An LP is not the order's
-- vendor, so the conditional REQUESTED->CLAIMED update matches 0 rows and the
-- action throws a spurious "order already claimed" — no LP could ever claim.
--
-- Fix: a tightly-scoped UPDATE policy that allows ONLY the REQUESTED -> CLAIMED
-- transition, and only when the caller is claiming the order for an LP profile
-- they own (is_lp_owner on the NEW lp_id). RLS policies for the same command are
-- OR'd, so this strictly ADDS the LP's ability without touching the vendor path.
--
-- Scope rationale:
--   using  (OLD row): status must be REQUESTED — only an unclaimed, claimable
--          order; an LP cannot touch orders in any other state.
--   check  (NEW row): status must become CLAIMED, lp_id must be non-null and
--          owned by the caller — an LP cannot assign the order to another LP,
--          cannot move it to any other state, and a non-LP (vendor) fails the
--          is_lp_owner check so cannot use this policy at all.
-- The contract (CashoutOrderProcessor) remains the source of truth for amounts;
-- the DB row is a mirror, and the daemon's on-chain claimByLP + the reconciler
-- catch any divergence.

create policy "cashout_orders lp claim" on cashout_orders
  for update
  using (status = 'REQUESTED')
  with check (
    status = 'CLAIMED'
    and lp_id is not null
    and is_lp_owner(lp_id::uuid)
  );

comment on policy "cashout_orders lp claim" on cashout_orders is
  'C1: lets a staked LP claim a REQUESTED order (-> CLAIMED) for an LP profile they own. Without this, live-mode LP claims strand. OR-combined with the vendor UPDATE policy.';
