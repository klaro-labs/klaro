// GOAL loop iteration — recurring create, CSV bulk import, KYB start, ERP
// connect. Hunt the cashout-class failure (500 / digest) + honesty gaps.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
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
const TAG = process.env.KLARO_RUN_TAG || "qa";
const shots = path.resolve("e2e/.goal-action-shots");
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[a4 ${++n}]`, ...a);
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: vrow } = await admin.from("vendors").select("id").eq("email", "xprtqk@gmail.com").maybeSingle();
const vendorId = vrow.id;
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
let errs = [];
page.on("console", (m) => { if (m.type() === "error" && !/reown|allowlist|403/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 140)));
await page.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor")}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png") }); } catch {} };
const digestOn = async () => /Server Components render|server-side exception/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
const results = {};

// ── 1. Recurring create ─────────────────────────────────────────────────────
try {
  errs = [];
  await page.goto(BASE + "/vendor/invoices/recurring", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Add recurring invoice')", { timeout: 15000 });
  await page.fill('input[name="customerEmail"], input[type="email"]', `recurring-qa-${TAG}@example.com`).catch(() => {});
  await page.fill('input[name="amount"], input[type="number"]', "25").catch(() => {});
  await page.fill('input[name="description"], input[type="text"]', `QA recurring ${TAG}`).catch(() => {});
  await page.locator("button:has-text('Add recurring invoice')").click();
  await page.waitForTimeout(3500);
  await shot("R1-recurring-after");
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  const digest = await digestOn();
  const showsSchedule = new RegExp(`recurring-qa-${TAG}|QA recurring ${TAG}`).test(body);
  results.recurring = digest ? "DIGEST/500" : `${showsSchedule ? "shows schedule" : "no schedule shown"} | active-section: ${body.match(/No recurring schedules yet|Active schedules[\s\S]{0,80}/i)?.[0]?.replace(/\s+/g, " ").slice(0, 70) ?? "?"} | errs=${errs.length}`;
} catch (e) { results.recurring = "ERR " + String(e).slice(0, 120); }
log("recurring:", results.recurring);

// ── 2. CSV bulk import ──────────────────────────────────────────────────────
try {
  errs = [];
  const before = (await admin.from("invoices").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? 0;
  const csvPath = path.join(shots, `import-${TAG}.csv`);
  writeFileSync(csvPath, `customerEmail,amount,description,dueAt\nimport-${TAG}-a@example.com,12.00,QA import A ${TAG},2026-07-15\nimport-${TAG}-b@example.com,34.50,QA import B ${TAG},2026-07-30\n`);
  await page.goto(BASE + "/vendor/invoices/import", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(csvPath).catch((e) => log("setInputFiles:", e.message.slice(0, 60)));
  await page.waitForTimeout(2500);
  await shot("I1-import-preview");
  // click the confirm/import button if a second step appears
  const confirm = page.locator("button", { hasText: /import|create .* invoice|confirm|upload/i }).first();
  if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) { log("clicking import confirm:", await confirm.innerText().catch(() => "?")); await confirm.click().catch(() => {}); await page.waitForTimeout(4000); }
  await shot("I2-import-after");
  const digest = await digestOn();
  const after = (await admin.from("invoices").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? before;
  results.import = digest ? "DIGEST/500" : after > before ? `PASS (invoices ${before}→${after})` : `CHECK (count ${before}→${after}, errs=${errs.length}, body=${(await page.evaluate(() => document.body.innerText).catch(() => "")).match(/preview|ready|error|invalid|rows|imported[^.]*/i)?.[0] ?? "?"})`;
} catch (e) { results.import = "ERR " + String(e).slice(0, 120); }
log("import:", results.import);

// ── 3. KYB start (Sumsub token mint) ────────────────────────────────────────
try {
  errs = [];
  await page.goto(BASE + "/vendor/settings", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const kyb = page.locator("button", { hasText: /Verify your business|Start verification|Begin verification|Start KYB/i }).first();
  if (await kyb.isVisible({ timeout: 5000 }).catch(() => false)) {
    log("clicking KYB:", await kyb.innerText().catch(() => "?"));
    await kyb.click().catch(() => {});
    await page.waitForTimeout(5000); // let the token mint + Sumsub SDK try to load
  } else log("KYB button not visible; body has:", (await page.evaluate(() => document.body.innerText).catch(() => "")).match(/KYB|verification[^.]*/i)?.[0] ?? "?");
  await shot("K1-kyb-after");
  const digest = await digestOn();
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  results.kyb = digest ? "DIGEST/500" : `${/not configured/i.test(body) ? "not-configured (honest)" : /sumsub|websdk|loading|review|pending|verifying/i.test(body) ? "SDK/flow started" : "?"} | errs=${errs.length}${errs.length ? " :: " + errs[0] : ""}`;
} catch (e) { results.kyb = "ERR " + String(e).slice(0, 120); }
log("kyb:", results.kyb);

// ── 4. ERP connect (QuickBooks OAuth redirect) ──────────────────────────────
try {
  errs = [];
  await page.goto(BASE + "/vendor/integrations/erp", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Connect QuickBooks'), a:has-text('Connect QuickBooks')", { timeout: 15000 });
  const qb = page.locator("button, a", { hasText: /Connect QuickBooks/i }).first();
  log("clicking Connect QuickBooks");
  await Promise.race([qb.click().catch(() => {}), page.waitForTimeout(2000)]);
  await page.waitForTimeout(4000);
  await shot("E1-erp-after");
  const url = page.url();
  const digest = await digestOn();
  results.erp = digest ? "DIGEST/500" : /intuit|quickbooks|appcenter|oauth/i.test(url) ? `PASS (redirected to OAuth: ${url.slice(0, 50)}…)` : `CHECK (url=${url.slice(0, 60)}, errs=${errs.length}${errs.length ? " :: " + errs[0] : ""})`;
} catch (e) { results.erp = "ERR " + String(e).slice(0, 120); }
log("erp:", results.erp);

await browser.close();
console.log("\n===== RECURRING / IMPORT / KYB / ERP =====");
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(11), v);
