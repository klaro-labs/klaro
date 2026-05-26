-- 0012_protocol_limits.sql
-- Audit finding L2 (loop 2, 2026-05-25): /admin/limits page rendered three
-- hardcoded arrays. Now seeded from this table so an operator can edit
-- (via a future admin UI) and the page reflects truth. Seed rows mirror
-- the current constants in code so behaviour doesn't change at deploy time.

create table if not exists protocol_limits (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('vendor', 'lp', 'protocol')),
  label        text not null,
  unit         text not null,
  value        text not null,
  why          text not null,
  position     int  not null default 100,
  updated_at   timestamptz not null default now(),
  unique (category, label)
);

create index if not exists protocol_limits_category_idx on protocol_limits(category, position);

alter table protocol_limits enable row level security;
create policy protocol_limits_read on protocol_limits for select to authenticated using (true);
revoke insert, update, delete on protocol_limits from authenticated;

-- Seed current constants. Operator UI edits via service-role.
insert into protocol_limits (category, label, unit, value, why, position) values
  ('vendor', 'Daily invoice cap',       'USDC', '100,000', 'Soft cap. Vendor can request raise after 30d streak.',                  10),
  ('vendor', 'Single invoice ceiling',  'USDC', '25,000',  'Per-invoice hard cap. Higher requires manual approval.',                20),
  ('vendor', 'Daily cashout cap',       'USDC', '50,000',  'Sum of LP-released USDC per UTC day.',                                  30),
  ('vendor', 'Cashout corridor cap',    'USDC', '10,000',  'Per-corridor (INR/BRL/PHP/MXN) daily cap.',                             40),
  ('vendor', 'Retainer stream ceiling', 'USDC', '20,000',  'Per-stream deposit cap (sum across active streams).',                   50),

  ('lp',     'Min stake (Tier 1)',      'USDC', '5,000',   'Smallest claimable cashout: $200 — $1,000.',                            10),
  ('lp',     'Min stake (Tier 2)',      'USDC', '25,000',  'Claimable: $1,000 — $5,000.',                                            20),
  ('lp',     'Min stake (Tier 3)',      'USDC', '100,000', 'Claimable: $5,000 — $25,000.',                                           30),
  ('lp',     'Slash on bad-proof',      'bps',  '1,000',   '10% of stake slashed when proof verifier rejects.',                     40),
  ('lp',     'Slash on dispute loss',   'bps',  '2,500',   '25% of stake slashed when dispute resolves LP-pays.',                   50),

  ('protocol','Per-tx fee cap',          'bps',  '80',      'Hard ceiling on FeeSplitter total payout. Audit fix P0-2.',             10),
  ('protocol','Agent fee cap',           'bps',  '5,000',   'AgentRegistry FEE_BPS_HARD_CAP. No agent can take more than 50%.',     20),
  ('protocol','Dispute SLA',             'hours','24',      'DisputeManager auto-pings admin after this window.',                    30),
  ('protocol','Cashout confirm window',  'hours','24',      'After PROOF_SUBMITTED, vendor must confirm or dispute.',                40),
  ('protocol','Counterparty cache TTL',  'hours','24',      'Default screening-result freshness in CounterpartyRegistry.',           50)
on conflict (category, label) do nothing;
