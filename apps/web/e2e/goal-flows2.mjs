// GOAL flows batch 2 — vendor-side flows via password-grant auth (no rate limit):
//   1. invoice form validation (negative amount, invalid email)
//   2. retainer page render + LiveCounter tick
//   3. delegations page render + revoke button
//   4. team page render
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

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
const SB = local.SUPABASE_URL, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const REF = SB.match(/https:\/\/([a-z0-9]+)\./)[1];
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const shots = path.resolve("e2e/.goal-flows2-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
const log = (...a) => console.log(...a);

// password-grant session → cookie
await fetch(`${SB}/auth/v1/admin/users/37adac16-1a23-4887-b822-baed0339de5b`, { method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ password: "Klaro-QA-Test-9x7Kp2!" }) });
const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: "xprtqk@gmail.com", password: "Klaro-QA-Test-9x7Kp2!" }) })).json();
if (!session.access_token) { console.error("grant failed", JSON.stringify(session).slice(0, 150)); process.exit(2); }
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const name = `sb-${REF}-auth-token`, domain = new URL(BASE).hostname, CHUNK = 3180;
const cookies = value.length <= CHUNK ? [{ name, value, domain, path: "/", secure: true, sameSite: "Lax" }]
  : value.match(new RegExp(`.{1,${CHUNK}}`, "g")).map((v, i) => ({ name: `${name}.${i}`, value: v, domain, path: "/", secure: true, sameSite: "Lax" }));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png"), fullPage: true }); } catch {} };

// ── 1. invoice form validation ───────────────────────────────────────────────
await page.goto(BASE + "/vendor/invoices/new", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("button:has-text('Create invoice')", { timeout: 15000 });
// negative amount + valid rest
await page.locator('input[type="number"]').first().fill("-50");
await page.getByPlaceholder(/Backend dev|sprint/i).fill("QA validation test");
await page.getByPlaceholder(/client@company|@/i).first().fill("buyer-qa@example.com");
await page.locator("button", { hasText: /Create invoice/i }).first().click();
await page.waitForTimeout(2500);
const afterNeg = page.url();
const negRejected = !/\/vendor\/invoices\/0x[0-9a-f]{64}/i.test(afterNeg);
await shot("01-negative-amount");
log("negative amount rejected:", negRejected, "(url:", afterNeg.replace(BASE, ""), ")");
// invalid email
await page.goto(BASE + "/vendor/invoices/new", { waitUntil: "domcontentloaded" });
await page.waitForSelector("button:has-text('Create invoice')", { timeout: 15000 });
await page.locator('input[type="number"]').first().fill("50");
await page.getByPlaceholder(/Backend dev|sprint/i).fill("QA validation test");
await page.getByPlaceholder(/client@company|@/i).first().fill("notanemail");
await page.locator("button", { hasText: /Create invoice/i }).first().click();
await page.waitForTimeout(2000);
const emailRejected = !/\/vendor\/invoices\/0x[0-9a-f]{64}/i.test(page.url());
await shot("02-invalid-email");
log("invalid email rejected:", emailRejected, "(url:", page.url().replace(BASE, ""), ")");

// ── 2. retainer render + live counter tick ───────────────────────────────────
await page.goto(BASE + "/vendor/retainer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const retBody1 = await page.evaluate(() => document.body.innerText).catch(() => "");
const retDigest = /Server Components render|server-side exception/i.test(retBody1);
// capture any live-ticking number, wait 4s, capture again
const nums1 = (retBody1.match(/\d+\.\d{2,}/g) || []).join(",");
await page.waitForTimeout(4000);
const retBody2 = await page.evaluate(() => document.body.innerText).catch(() => "");
const nums2 = (retBody2.match(/\d+\.\d{2,}/g) || []).join(",");
await shot("03-retainer");
log("retainer: digest=" + retDigest + " | hasStream=" + /stream|retainer|claim|drawdown/i.test(retBody1) + " | counterTicked=" + (nums1 !== nums2 && nums1.length > 0));

// ── 3. delegations render + revoke button ────────────────────────────────────
await page.goto(BASE + "/vendor/delegations", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1800);
const delBody = await page.evaluate(() => document.body.innerText).catch(() => "");
await shot("04-delegations");
const revokeBtn = await page.locator("button", { hasText: /revoke/i }).count();
log("delegations: digest=" + /Server Components render/i.test(delBody) + " | delegate-form=" + /delegate|budget|session key/i.test(delBody) + " | revoke-buttons=" + revokeBtn);

// ── 4. team render ───────────────────────────────────────────────────────────
await page.goto(BASE + "/vendor/team", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
const teamBody = await page.evaluate(() => document.body.innerText).catch(() => "");
await shot("05-team");
log("team: digest=" + /Server Components render/i.test(teamBody) + " | roles=" + /owner|admin|member|readonly/i.test(teamBody));

console.log("screenshots:", shots);
await browser.close();
