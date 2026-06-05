/**
 * Seed script for Klaro Supabase. Idempotent.
 * Run after `supabase db reset` (which applies all migrations) so demo + e2e
 * have a known vendor / LP / admin / invoices to walk through.
 * pnpm --filter @klaro/web exec tsx scripts/seed.ts
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";
// read via env.ts (was direct process.env reads). CLI scripts
// are still part of the env-audit-boundary discipline.
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../lib/env";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("seed: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upsertAuthUser(
  email: string,
  password: string,
): Promise<string> {
  // Look up or create the auth.users row.
  const { data: existing } = await sb.auth.admin.listUsers();
  const hit = existing?.users.find((u) => u.email === email);
  if (hit) return hit.id;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("createUser returned no user");
  return data.user.id;
}

async function main() {
  console.log("[seed] auth users…");
  const vendorAuthId = await upsertAuthUser(
    "asha@aether.studio",
    "Klaro-Demo-2026!",
  );
  const adminAuthId = await upsertAuthUser("prateek@myklaro.app", "Klaro-Ops-2026!");
  const lpAuthId = await upsertAuthUser("aakash@bombaylp.in", "Klaro-LP-2026!");

  console.log("[seed] admin row…");
  await sb.from("admins").upsert(
    {
      supabase_user_id: adminAuthId,
      email: "prateek@myklaro.app",
      display_name: "Klaro Operator",
      role: "admin",
    },
    { onConflict: "supabase_user_id" },
  );

  console.log("[seed] vendor row…");
  const { data: vendor, error: vErr } = await sb
    .from("vendors")
    .upsert(
      {
        supabase_user_id: vendorAuthId,
        display_name: "Asha Rao",
        email: "asha@aether.studio",
        country: "IN",
        wallet: "0x7a3c000000000000000000000000000000000b21",
        brand_color: "#1B6BFF",
        invoice_template_version: 1,
      },
      { onConflict: "supabase_user_id" },
    )
    .select()
    .single();
  if (vErr) throw vErr;

  await sb.from("vendor_kyb").upsert(
    {
      vendor_id: vendor.id,
      status: "approved",
      tier: 2,
      kyb_record_hash: "0x" + "ab".repeat(32),
    },
    { onConflict: "vendor_id" },
  );

  await sb.from("vendor_limits").upsert(
    {
      vendor_id: vendor.id,
      max_invoice_usdc: "100000.000000",
      max_cashout_usdc_daily: "10000.000000",
      max_cashout_usdc_total: "50000.000000",
    },
    { onConflict: "vendor_id" },
  );

  console.log("[seed] customers…");
  const customers = [
    { email: "ops@studio-onyx.com", name: "Studio Onyx" },
    { email: "billing@tilde-co.io", name: "Tilde & Co" },
    { email: "ar@avenel-studio.com", name: "Avenel Studio" },
  ];
  for (const c of customers) {
    await sb
      .from("customers")
      .upsert(
        { vendor_id: vendor.id, ...c },
        { onConflict: "vendor_id,email" },
      );
  }

  console.log("[seed] sample invoices…");
  const invoices = [
    {
      id: "0x" + "01".repeat(32),
      customer_email: "ops@studio-onyx.com",
      customer_name: "Studio Onyx",
      amount: "4200.000000",
      status: "PAID" as const,
      days: -1,
    },
    {
      id: "0x" + "02".repeat(32),
      customer_email: "billing@tilde-co.io",
      customer_name: "Tilde & Co",
      amount: "1860.000000",
      status: "ACCEPTED" as const,
      days: 2,
    },
    {
      id: "0x" + "03".repeat(32),
      customer_email: "ar@avenel-studio.com",
      customer_name: "Avenel Studio",
      amount: "640.000000",
      status: "PAID" as const,
      days: -8,
    },
    {
      id: "0x" + "04".repeat(32),
      customer_email: "ops@studio-onyx.com",
      customer_name: "Studio Onyx",
      amount: "12400.000000",
      status: "CREATED" as const,
      days: 7,
    },
    {
      id: "0x" + "05".repeat(32),
      customer_email: "billing@tilde-co.io",
      customer_name: "Tilde & Co",
      amount: "540.000000",
      status: "CREATED" as const,
      days: 14,
    },
  ];
  for (const inv of invoices) {
    await sb.from("invoices").upsert(
      {
        id: inv.id,
        vendor_id: vendor.id,
        customer_email: inv.customer_email,
        customer_name: inv.customer_name,
        amount_usdc: inv.amount,
        token: "0x3600000000000000000000000000000000000000",
        due_at: new Date(Date.now() + inv.days * 86_400_000).toISOString(),
        status: inv.status,
        metadata_hash: "0x" + "cd".repeat(32),
      },
      { onConflict: "id" },
    );
  }

  console.log("[seed] lp profile…");
  await sb.from("lp_profiles").upsert(
    {
      lp_id: "0x" + "aa".repeat(32),
      supabase_user_id: lpAuthId,
      contact_email: "aakash@bombaylp.in",
      legal_entity_name: "Bombay LP Pvt Ltd",
      country: "IN",
      wallet: "0x99aa00000000000000000000000000000000aabb",
      tier: 3,
      status: "STAKED",
      staked_usdc: "5000.000000",
      active_exposure_usdc: "0.000000",
    },
    { onConflict: "lp_id" },
  );

  console.log("[seed] webhook + erp samples…");
  await sb.from("webhooks").upsert(
    {
      vendor_id: vendor.id,
      url: "https://acme.com/klaro-webhook",
      events: ["invoice.paid", "cashout.released"],
      secret_ciphertext: "encrypted-placeholder",
      status: "active",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  console.log("[seed] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
