// GOAL live-action driver — drives the no-wallet live write flows to completion
// against the LIVE site and verifies each landed in the DB:
//   1. Branding save (vendors row)   2. Webhook add (webhooks row)
//   3. Payment link create (payment_links row)
// Round-trips branding (mutates then reverts) so the QA workspace is unchanged.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file) {
  const o = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const shots = path.resolve("e2e/.goal-action-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
const TAG = process.env.KLARO_RUN_TAG || "qa";
let n = 0; const log = (...a) => console.log(`[act ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: vendorRow } = await admin.from("vendors").select("id,display_name,brand_color").eq("email", "xprtqk@gmail.com").maybeSingle();
const vendorId = vendorRow?.id;
log("vendor:", vendorId, "current name:", vendorRow?.display_name, "color:", vendorRow?.brand_color);

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
const callback = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor")}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png") }); } catch {} };
const results = {};

// ── 1. Branding save (round-trip) ───────────────────────────────────────────
try {
  await page.goto(BASE + "/vendor/settings", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Save branding')", { timeout: 15000 });
  const orig = await page.locator('input[name="displayName"]').inputValue();
  const newName = `${orig.replace(/ · QA-.*/, "")} · QA-${TAG}`;
  await page.fill('input[name="displayName"]', newName);
  await shot("01-branding-filled");
  await page.locator("button:has-text('Save branding')").click();
  await page.waitForTimeout(3500);
  const { data: after } = await admin.from("vendors").select("display_name").eq("id", vendorId).maybeSingle();
  const ok = after?.display_name === newName;
  results.branding = ok ? `PASS (DB now "${after.display_name}")` : `FAIL (DB="${after?.display_name}", wanted "${newName}")`;
  log("branding:", results.branding);
  // revert
  await page.fill('input[name="displayName"]', orig);
  await page.locator("button:has-text('Save branding')").click();
  await page.waitForTimeout(2500);
  const { data: rev } = await admin.from("vendors").select("display_name").eq("id", vendorId).maybeSingle();
  log("branding reverted to:", rev?.display_name);
} catch (e) { results.branding = "ERR " + String(e).slice(0, 120); log("branding err:", results.branding); }

// ── 2. Webhook add ──────────────────────────────────────────────────────────
let webhookUrl = `https://qa-${TAG}.example.com/klaro-webhook`;
try {
  await page.goto(BASE + "/vendor/integrations/webhooks", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Add endpoint')", { timeout: 15000 });
  await page.fill('input[placeholder*="klaro-webhook"], input[type="url"], input[placeholder*="yourapp"]', webhookUrl);
  await shot("02-webhook-filled");
  await page.locator("button:has-text('Add endpoint')").click();
  await page.waitForTimeout(3500);
  const { data: hooks } = await admin.from("webhooks").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(3);
  const found = (hooks ?? []).find((h) => JSON.stringify(h).includes(webhookUrl));
  results.webhook = found ? `PASS (DB row id=${found.id})` : `FAIL (no DB row matching ${webhookUrl}; newest=${JSON.stringify(hooks?.[0] ?? {}).slice(0, 120)})`;
  log("webhook:", results.webhook);
  await shot("02b-webhook-after");
  // cleanup the test endpoint
  if (found) { await admin.from("webhooks").delete().eq("id", found.id); log("webhook test row deleted"); }
} catch (e) { results.webhook = "ERR " + String(e).slice(0, 120); log("webhook err:", results.webhook); }

// ── 3. Payment link create ──────────────────────────────────────────────────
try {
  await page.goto(BASE + "/vendor/links/new", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // inspect the form, fill amount + label, submit
  await page.locator('input[type="number"], input[name="amount"], input[inputmode="decimal"]').first().fill("2").catch(() => {});
  await page.locator('input[name="label"], input[name="description"], input[type="text"]').first().fill(`QA goal link ${TAG}`).catch(() => {});
  await shot("03-link-filled");
  const createBtn = page.locator("button", { hasText: /create|generate|new link|make link/i }).first();
  const beforeCount = (await admin.from("payment_links").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? 0;
  if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(3500);
  } else { log("link create button not found; body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 200)); }
  const { data: links, count: afterCount } = await admin.from("payment_links").select("id,slug,amount_usdc,label,created_at", { count: "exact" }).eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(1);
  const ok = (afterCount ?? 0) > beforeCount;
  results.link = ok ? `PASS (new link slug=${links?.[0]?.slug}, ${beforeCount}→${afterCount})` : `CHECK (count ${beforeCount}→${afterCount}; newest=${JSON.stringify(links?.[0] ?? {}).slice(0, 120)})`;
  log("link:", results.link);
  await shot("03b-link-after");
} catch (e) { results.link = "ERR " + String(e).slice(0, 120); log("link err:", results.link); }

await browser.close();
console.log("\n===== LIVE ACTIONS =====");
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(10), v);
console.log("screenshots:", shots);
