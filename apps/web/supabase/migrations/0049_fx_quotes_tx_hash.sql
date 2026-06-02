-- #6 (build pass 2026-06-02): the FX worker now executes a real on-chain
-- USDC<->EURC swap via StableFXAdapterRegistry.swap (MockStableFXAdapter +
-- MockEURC on testnet). Record the settling tx hash on the quote so a settled
-- row is distinguishable from a still-simulated one, and so the worker is
-- idempotent on retry — a row already stamped status='executed' with a tx_hash
-- is never re-swapped (a double-swap would be a double-spend).
alter table public.fx_quotes add column if not exists tx_hash text;
