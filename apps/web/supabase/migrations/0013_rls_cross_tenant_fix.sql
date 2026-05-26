-- Klaro · 0013 — RLS cross-tenant leak emergency fix.
-- Audit fix — surfaced by parallel database-reviewer
-- subagent scan against migrations 0001-0012.
-- Three P0 cross-tenant defects fixed here:
-- 1. `invoices` had TWO conflicting SELECT policies:
-- `invoices vendor read` using (vendor_id = current_vendor_id() or is_admin())
-- `invoices public by id` using (true)
-- PostgreSQL RLS OR's policies for the same command — so every authenticated
-- session could SELECT every other vendor's invoices, customer emails,
-- amounts, and status. The vendor-scoped policy was dead weight. The
-- `using (true)` was probably written to support the public `/i/[id]`
-- hosted-invoice page; that route should serve via `serviceDb()` from
-- a server action that performs its own auth, NOT rely on permissive RLS.
-- 2. `invoice_line_items` policy subquery had `or is_admin() or true`. The
-- trailing `or true` short-circuits the whole clause to always-true. Every
-- line item for every vendor was readable. Same fix.
-- 3. `audit_logs` had a SELECT policy but no INSERT/UPDATE/DELETE restriction
-- on the `authenticated` role. A vendor session could append arbitrary
-- audit entries with any actor_id, forging audit trails. revoke explicit.

-- ─── invoices: drop the blanket public policy ──────────────────────────
drop policy if exists "invoices public by id" on invoices;
-- Vendor-scoped policy is preserved; nothing else changes for that read path.

-- ─── invoice_line_items: rewrite policy without the `or true` ──────────
drop policy if exists "line items inherit invoice" on invoice_line_items;
create policy "line items inherit invoice"
  on invoice_line_items
  for select
  using (
    exists (
      select 1 from invoices i
       where i.id = invoice_id
         and (i.vendor_id = current_vendor_id() or is_admin())
    )
  );

-- ─── audit_logs: revoke write privileges from vendor sessions ──────────
-- Audit log writes must come from server-side actions using serviceDb() or
-- from the daemon (service-role). Never directly from a vendor session.
revoke insert, update, delete on audit_logs from authenticated;

-- ─── Verification: re-enable RLS on all three (no-op if already on) ────
alter table invoices            enable row level security;
alter table invoice_line_items  enable row level security;
alter table audit_logs          enable row level security;
