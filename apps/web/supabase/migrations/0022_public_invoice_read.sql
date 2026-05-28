-- Public /i/[id] pay page needs a single-row lookup by id without exposing the
-- whole invoices table to anon. SECURITY DEFINER RPC scopes the read to one
-- id per call — no enumeration, no mass data exposure. Caller must already
-- know the 256-bit keccak invoice id (the URL is the capability).
--
-- Earlier draft of this migration added `for select to anon using(true)` on
-- invoices + invoice_line_items + vendors. That was a critical IDOR / mass
-- data leak (the anon key is in every browser bundle, so anyone could
-- enumerate every vendor's invoice history + customer emails). The RPC
-- pattern below is the proper fix.

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
stable
set search_path = public
as $$
  select
    i.id,
    i.vendor_id,
    v.wallet as vendor_wallet,
    v.display_name as vendor_display_name,
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

-- Allow anonymous + authenticated callers; the function is the bottleneck.
revoke all on function public.get_public_invoice(text) from public;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
