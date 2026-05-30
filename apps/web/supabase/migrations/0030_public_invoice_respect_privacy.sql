-- Audit 2026-05-30 (HIGH): public.get_public_invoice returned customer_email,
-- customer_name and amount_usdc unconditionally, ignoring privacy_mode entirely
-- (identical defect in 0022 + 0023). Anyone holding an invoice id (shared with
-- the buyer, forwardable) could read the customer's PII and the amount even when
-- the vendor chose to hide them. Re-create the RPC so it enforces privacy_mode
-- in SQL: only expose fields the vendor chose to reveal.
--   privacy_mode = 'hide_customer' -> NULL customer_email + customer_name
--   privacy_mode = 'hide_amount'   -> NULL amount_usdc + NULL line-item amounts
--   privacy_mode = 'public'        -> expose all (unchanged behaviour)
create or replace function public.get_public_invoice(p_id text)
returns table (
  id text,
  vendor_id uuid,
  vendor_wallet text,
  vendor_display_name text,
  token text,
  amount_usdc numeric,
  customer_email text,
  customer_name text,
  status text,
  due_at timestamptz,
  privacy_mode text,
  notes_md text,
  metadata_hash text,
  splits_hash text,
  created_at timestamptz,
  updated_at timestamptz,
  line_items json
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.vendor_id,
    v.wallet as vendor_wallet,
    v.display_name as vendor_display_name,
    i.token,
    case when coalesce(i.privacy_mode, 'public') = 'hide_amount'
      then null else i.amount_usdc end as amount_usdc,
    case when coalesce(i.privacy_mode, 'public') = 'hide_customer'
      then null else i.customer_email end as customer_email,
    case when coalesce(i.privacy_mode, 'public') = 'hide_customer'
      then null else i.customer_name end as customer_name,
    i.status,
    i.due_at,
    coalesce(i.privacy_mode, 'public') as privacy_mode,
    i.notes_md,
    i.metadata_hash,
    i.splits_hash,
    i.created_at,
    i.updated_at,
    (
      select coalesce(
        json_agg(json_build_object(
          'description', li.description,
          'amount_usdc', case when coalesce(i.privacy_mode, 'public') = 'hide_amount'
            then null else li.amount_usdc end,
          'position', li.position
        ) order by li.position),
        '[]'::json
      )
      from invoice_line_items li where li.invoice_id = i.id
    ) as line_items
  from invoices i
  join vendors v on v.id = i.vendor_id
  where i.id = p_id
  limit 1;
$$;

revoke all on function public.get_public_invoice(text) from public;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
