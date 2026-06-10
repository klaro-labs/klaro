-- Vendor Branding (logo + colour) was stored but rendered nowhere. The hosted
-- invoice /i/[id] is the buyer-facing surface where it belongs, but the anon
-- read RPC didn't expose it. Add the two public-safe fields (a hex colour + an
-- https logo URL — no PII) to get_public_invoice. Altering a RETURNS TABLE
-- signature needs a drop first; CREATE OR REPLACE cannot change the return type.

drop function if exists public.get_public_invoice(text);

create function public.get_public_invoice(p_id text)
returns table (
  id text,
  vendor_id uuid,
  vendor_wallet text,
  vendor_display_name text,
  vendor_brand_color text,
  vendor_brand_logo_url text,
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
stable
set search_path = public
as $$
  select
    i.id,
    i.vendor_id,
    v.wallet as vendor_wallet,
    v.display_name as vendor_display_name,
    v.brand_color as vendor_brand_color,
    v.brand_logo_url as vendor_brand_logo_url,
    i.token,
    i.amount_usdc,
    i.customer_email,
    i.customer_name,
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
        json_agg(json_build_object('description', li.description, 'amount_usdc', li.amount_usdc, 'position', li.position) order by li.position),
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
