// Webhook persistence UI E2E (no wallet — vendor config flow). Proves the
// payoff of migrations 0035/0036 through the REAL app UI + verifies the live
// Supabase rows directly (service-role read):
//   VENDOR magic-link login -> /vendor/integrations/webhooks
//   -> add a public endpoint -> webhook_create RPC (0035) returns the signing
//      secret ONCE; UI shows the copy-once banner; DB row is encrypted.
//   -> reload: endpoint persists.
//   -> Send test ping -> recordDelivery inserts a webhook_deliveries row
//      (proves 0036 "deliveries vendor insert" policy).
//   -> Remove: status='deleted', drops out of the list + DB.
//
// Run from apps/web with the dev server on :3100 (live Supabase env):
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-webhooks.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100"; // login flow → cookie is origin-scoped to localhost
let n = 0;
const log = (...a: unknown[]) => console.log(`[wh ${++n}]`, ...a);
const admin = createClient(
  local.SUPABASE_URL,
  local.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
};

const stamp = Date.now();
const url = `https://example.com/klaro-wh-${stamp}`;
log("endpoint url:", url);

// ── magic-link login ──────────────────────────────────────────────────
const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const next = encodeURIComponent("/vendor/integrations/webhooks");
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${next}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const loginPage = await ctx.newPage();
await loginPage.goto(callback, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await loginPage.waitForTimeout(2500);
log("login landed:", loginPage.url());
await loginPage.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message.slice(0, 160)));
await page.goto(`${BASE}/vendor/integrations/webhooks`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on webhooks page:", page.url());
if (/\/signin/.test(page.url())) {
  console.error("session not established (bounced to signin)");
  await browser.close();
  process.exit(2);
}

// ── create endpoint ───────────────────────────────────────────────────
await page.locator('input[name="url"]').first().fill(url);
await page.locator('form button[type="submit"]').first().click();

// one-time secret banner must appear with a whsec_ secret
const banner = page.getByText(/won.{0,3}t be shown again/i).first();
await banner.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
const bannerShown = await banner.isVisible().catch(() => false);
check("UI: one-time secret banner shown", bannerShown);
// the banner has two <code> nodes: the "Klaro-Signature" header reference and
// the actual secret (in the flex row with the Copy button) — take the last.
const secret = await page
  .locator(".bg-amber-50 code")
  .last()
  .innerText()
  .catch(() => "");
log("revealed secret:", secret.slice(0, 14) + "…");
check(
  "UI: secret has whsec_ + 48 hex chars",
  /^whsec_[0-9a-f]{48}$/.test(secret),
  secret.slice(0, 14),
);

// ── verify the live DB row (service-role read) ────────────────────────
await page.waitForTimeout(1200);
const { data: rows } = await admin
  .from("webhooks")
  .select("id,vendor_id,url,events,status,secret_ciphertext")
  .eq("url", url);
const row = rows?.[0];
log(
  "db row:",
  row
    ? `status=${row.status} events=${(row.events as string[])?.length} ciphertext_len=${String(row.secret_ciphertext ?? "").length}`
    : "(none)",
);
check("DB: webhook row persisted active", row?.status === "active");
check(
  "DB: signing secret stored ENCRYPTED (ciphertext present, not plaintext)",
  !!row?.secret_ciphertext &&
    !String(row.secret_ciphertext).includes(secret) &&
    String(row.secret_ciphertext).length > 40,
);
const webhookId = row?.id as string | undefined;

// ── reload: endpoint persists in the list ─────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const persists = await page
  .getByText(url, { exact: false })
  .first()
  .isVisible()
  .catch(() => false);
check("UI: endpoint persists after reload", persists);

// ── test ping → webhook_deliveries row (proves 0036 deliveries insert) ─
const pingBtn = page.getByRole("button", { name: /Send test ping/i }).first();
if (await pingBtn.isVisible().catch(() => false)) {
  await pingBtn.click();
  await page.waitForTimeout(4000); // ping + recordDelivery
}
if (webhookId) {
  const { data: deliveries } = await admin
    .from("webhook_deliveries")
    .select("id,event,status")
    .eq("webhook_id", webhookId);
  log("deliveries:", JSON.stringify(deliveries ?? []));
  check(
    "DB: test-ping recorded a delivery row (0036 deliveries-insert policy works)",
    (deliveries?.length ?? 0) >= 1,
    `${deliveries?.length ?? 0} row(s)`,
  );
}

// ── deactivate (Remove) ───────────────────────────────────────────────
const removeBtn = page.getByRole("button", { name: /^Remove$/i }).first();
if (await removeBtn.isVisible().catch(() => false)) {
  await removeBtn.click();
  await page.waitForTimeout(2500);
}
const goneFromUi = !(await page
  .getByText(url, { exact: false })
  .first()
  .isVisible()
  .catch(() => false));
check("UI: endpoint removed from list after deactivate", goneFromUi);
const { data: afterRows } = await admin
  .from("webhooks")
  .select("status")
  .eq("url", url);
check(
  "DB: endpoint status='deleted' after deactivate",
  afterRows?.[0]?.status === "deleted",
  afterRows?.[0]?.status ?? "(missing)",
);

await browser.close();
console.log(`\nWEBHOOK_ID=${webhookId ?? ""}`);
console.log(`WEBHOOK_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
