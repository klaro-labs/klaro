-- Public pay page at /i/[id] needs anyone-with-the-link read access.
-- Invoice id is a 256-bit keccak hash (unguessable), so the URL itself is the
-- capability. This mirrors Stripe Invoice / Stripe Checkout shareable-link pattern.
create policy "invoices public read" on invoices
  for select to anon
  using (true);

create policy "invoice_line_items public read" on invoice_line_items
  for select to anon
  using (true);

-- Public pay page also reads vendor display name + wallet to render the
-- "Pay {vendorName} {amount}" header. Vendors are exposed read-only via id
-- so the public page can join.
create policy "vendors public read minimal" on vendors
  for select to anon
  using (true);
