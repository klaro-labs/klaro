-- QA-035: cashoutAdvancer + proofVerifier both expect verified_at + simulated
-- on payout_proofs but the original migration never added them. The proof
-- verification path silently failed every cashout (PostgREST 'column does
-- not exist' propagated as a 500 from cashout-advance worker).
--
-- Add the two columns + a partial index on (verified_at IS NULL) to keep
-- the "needs verification" sweep fast as proof volume grows.

alter table public.payout_proofs
  add column if not exists verified_at timestamptz null,
  add column if not exists simulated boolean not null default false;

-- Hot path: proofVerifier scans for unverified proofs. Partial index is
-- much smaller than a full one when most proofs are already verified.
create index if not exists payout_proofs_unverified_idx
  on public.payout_proofs (submitted_at)
  where verified_at is null;

comment on column public.payout_proofs.verified_at is
  'Timestamp set by daemon proofVerifier worker after the proof is checked. NULL = pending review.';
comment on column public.payout_proofs.simulated is
  'true when the verification was synthesised (no real bank-rail integration). Receipt UI surfaces this via the [SIMULATED] badge per principle 8.';
