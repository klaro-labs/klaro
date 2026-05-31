-- 0035 — persist webhook endpoints.
-- The per-endpoint HMAC secret shown to the vendor is generated and encrypted
-- at rest with the WEBHOOK_ENC_KEY vault secret, and returned in plaintext
-- exactly once (at creation). Delivery still signs with the global
-- WEBHOOK_HMAC_SECRET (per-endpoint signing is the M11 design pass) — this is
-- at-rest storage of the displayed secret, not yet the signing path.
--
-- security definer so the function can read the vault key; ownership is
-- enforced against vendors.supabase_user_id = auth.uid(), the same rule as the
-- "vendor reads own" RLS policy on vendors. Granted to authenticated only.

create or replace function public.webhook_create(
  p_vendor_id uuid,
  p_url text,
  p_events text[]
) returns table(id uuid, signing_secret text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_secret text;
  v_id uuid;
begin
  if not exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.supabase_user_id = auth.uid()
  ) then
    raise exception 'not authorized for vendor %', p_vendor_id using errcode = '42501';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'WEBHOOK_ENC_KEY';
  if v_key is null then
    raise exception 'WEBHOOK_ENC_KEY missing from vault';
  end if;

  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.webhooks (vendor_id, url, events, secret_ciphertext, status)
  values (
    p_vendor_id, p_url, p_events,
    extensions.pgp_sym_encrypt(v_secret, v_key), 'active'
  )
  returning webhooks.id into v_id;

  return query select v_id, v_secret;
end;
$$;

revoke all on function public.webhook_create(uuid, text, text[]) from public;
grant execute on function public.webhook_create(uuid, text, text[]) to authenticated;
