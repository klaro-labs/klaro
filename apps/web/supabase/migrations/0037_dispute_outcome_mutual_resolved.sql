-- 0037 — add MUTUAL_RESOLVED to dispute_outcome.
-- The on-chain DisputeManager.Outcome enum has MUTUAL_RESOLVED(5) for ad-hoc
-- (non-escrow) cases, but the DB enum stopped at PENALIZE_VENDOR(4). The daemon
-- Decided handler now maps 5→'MUTUAL_RESOLVED'; without this value the write
-- would skip the outcome and leave a DECIDED row with a null outcome (a
-- permanent DB↔chain split). Additive + idempotent.

alter type dispute_outcome add value if not exists 'MUTUAL_RESOLVED';
