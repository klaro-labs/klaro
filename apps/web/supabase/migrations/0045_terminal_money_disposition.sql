-- A7 (launch audit 2026-06-01): terminal-money disposition columns. Today a
-- RELEASED cashout row is indistinguishable from a refund — we record `status`
-- and `resolved_at` but not WHO got the money or HOW MUCH (net of fee). After an
-- incident you cannot reconcile who-was-paid from the DB alone. Add explicit
-- disposition columns, populated on every terminal transition by the workers.
--
-- Numeric money columns are stored as text/numeric and read as precision-
-- preserving strings by the repo layer (matches usdc_amount et al.).

-- cashout_orders: RELEASED -> LP got (amount - fee); refund/expire/cancel -> vendor got full.
alter table cashout_orders add column if not exists released_to    text;        -- payee address on a successful release (LP wallet)
alter table cashout_orders add column if not exists amount_paid     numeric;     -- net USDC actually paid to released_to (gross - fee)
alter table cashout_orders add column if not exists fee_collected   numeric;     -- protocol fee withheld to the fee receiver (0 if free / refund)
alter table cashout_orders add column if not exists refunded_to     text;        -- vendor address on a refund/expire/cancel/slash path
alter table cashout_orders add column if not exists disposition_tx  text;        -- the settling tx hash (release or refund)

-- agent_jobs: CLOSED -> agent got (amount); fee to receiver. Cancel -> funder refunded.
alter table agent_jobs add column if not exists released_to   text;
alter table agent_jobs add column if not exists amount_paid   numeric;
alter table agent_jobs add column if not exists fee_collected numeric;
alter table agent_jobs add column if not exists refunded_to   text;
alter table agent_jobs add column if not exists disposition_tx text;

comment on column cashout_orders.amount_paid is 'A7: net USDC paid to released_to on a successful release (gross usdc_amount minus fee_collected). Null until terminal.';
comment on column cashout_orders.fee_collected is 'A7: protocol fee withheld on release (matches on-chain klaroFee). 0 on free corridors and all refund paths.';
