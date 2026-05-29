-- Klaro Link: tie a link-originated invoice back to its parent payment_link so
-- the daemon can bump payment_links.paid_count on settle without a slug
-- reverse-lookup. Nullable + additive — every existing invoice (no link) keeps
-- link_id = null and all current createInvoice callers are unaffected.

alter table invoices add column if not exists link_id uuid references payment_links(id) on delete set null;

create index if not exists invoices_link_idx on invoices (link_id) where link_id is not null;
