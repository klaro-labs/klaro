-- Klaro Link: reusable USDC payment links ("Pay me $500 USDC").
-- A link is NOT an invoice. The backing invoice row is created at PAY time
-- (deferred), so links that are never paid create no invoice rows. The slug is
-- an 8-char Base58 short code shareable by voice/bio/WhatsApp.

create table if not exists payment_links (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendors(id) on delete cascade,
  slug           text not null unique,           -- 8-char Base58 short code
  amount_usdc    numeric(38,6) not null,
  label          text,                           -- optional line-item description
  expires_at     timestamptz,                    -- null = never expires
  deactivated_at timestamptz,                    -- soft-delete / vendor revoke
  view_count     int not null default 0,
  paid_count     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists payment_links_vendor_idx on payment_links (vendor_id, created_at desc);
create unique index if not exists payment_links_slug_idx on payment_links (slug);

alter table payment_links enable row level security;

-- Vendor-scoped access mirrors the invoices table RLS (current_vendor_id() +
-- is_admin() defined in 0001_extensions_and_helpers.sql).
drop policy if exists "links vendor read" on payment_links;
create policy "links vendor read"   on payment_links for select using (vendor_id = current_vendor_id() or is_admin());
drop policy if exists "links vendor insert" on payment_links;
create policy "links vendor insert" on payment_links for insert with check (vendor_id = current_vendor_id());
drop policy if exists "links vendor update" on payment_links;
create policy "links vendor update" on payment_links for update using (vendor_id = current_vendor_id());

-- Public slug lookup (anon-safe) — same SECURITY DEFINER pattern as
-- get_public_invoice (0023). Single-row by-slug only, no enumeration.
create or replace function public.get_public_link(p_slug text)
returns table (
  id uuid, vendor_id uuid, vendor_wallet text, vendor_display_name text,
  slug text, amount_usdc numeric, label text, expires_at timestamptz,
  deactivated_at timestamptz, view_count int, paid_count int, created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select pl.id, pl.vendor_id, v.wallet, v.display_name,
         pl.slug, pl.amount_usdc, pl.label, pl.expires_at,
         pl.deactivated_at, pl.view_count, pl.paid_count, pl.created_at
  from payment_links pl
  join vendors v on v.id = pl.vendor_id
  where pl.slug = p_slug
  limit 1;
$$;
revoke all on function public.get_public_link(text) from public;
grant execute on function public.get_public_link(text) to anon, authenticated;

-- Atomic view-count bump (fire-and-forget from the /pay/[slug] server component).
create or replace function public.increment_link_view(p_slug text)
returns void language sql security definer set search_path = public
as $$
  update payment_links set view_count = view_count + 1 where slug = p_slug;
$$;
revoke all on function public.increment_link_view(text) from public;
grant execute on function public.increment_link_view(text) to anon, authenticated;
