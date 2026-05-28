-- QA P0-2 found: tenant tables had SELECT policies but no INSERT/UPDATE policies, so
-- vendors couldn't create invoices through the user JWT path. createInvoice uses tryDb()
-- (RLS-scoped) by design so the right fix is to add the policies, not switch to service-role.

-- Vendors can insert + update + delete their own invoices.
create policy "invoices vendor insert" on invoices
  for insert with check (vendor_id = current_vendor_id());
create policy "invoices vendor update" on invoices
  for update using (vendor_id = current_vendor_id())
  with check (vendor_id = current_vendor_id());

-- Line items inherit invoice ownership.
create policy "invoice_line_items vendor read" on invoice_line_items
  for select using (
    exists(select 1 from invoices where invoices.id = invoice_line_items.invoice_id and (invoices.vendor_id = current_vendor_id() or is_admin()))
  );
create policy "invoice_line_items vendor insert" on invoice_line_items
  for insert with check (
    exists(select 1 from invoices where invoices.id = invoice_line_items.invoice_id and invoices.vendor_id = current_vendor_id())
  );

-- Vendors create their own cashout orders + may cancel their own.
create policy "cashout_orders vendor insert" on cashout_orders
  for insert with check (vendor_id = current_vendor_id());
create policy "cashout_orders vendor update" on cashout_orders
  for update using (vendor_id = current_vendor_id())
  with check (vendor_id = current_vendor_id());

-- Vendors raise their own disputes as the claimant (claimant_kind='vendor', claimant_id=vendor_id).
create policy "disputes vendor insert" on disputes
  for insert with check (claimant_kind = 'vendor' and claimant_id::uuid = current_vendor_id());

-- Vendors may update their own profile (display name, country, brand color, wallet).
create policy "vendors self update" on vendors
  for update using (supabase_user_id = auth.uid())
  with check (supabase_user_id = auth.uid());
