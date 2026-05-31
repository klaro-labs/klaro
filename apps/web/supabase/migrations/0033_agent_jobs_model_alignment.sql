-- 0033 — align `agent_jobs` with the AgentJob app model.
-- 0005 has no home for the agent label / job description the UI renders, and
-- requires agent_wallet NOT NULL even though AgentRegistry binds no payout
-- address yet (audit #32). Add the label/description columns and relax
-- agent_wallet so the live repo can persist a job created from the registry.
-- Additive + idempotent.

alter table public.agent_jobs add column if not exists agent_label text;
alter table public.agent_jobs add column if not exists description text;
alter table public.agent_jobs alter column agent_wallet drop not null;
