// GOAL flows batch 3 — drive retainer + delegations to completion (the recorded/
// local part that's live; on-chain legs are honestly partner-pending).
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
const shots = path.resolve("e2e/.goal-flows3-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

await fetch(`${SB}/auth/v1/admin/users/37adac16-1a23-4887-b822-baed0339de5b`, { method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ password: "Klaro-QA-Test-9x7Kp2!" }) });
const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: "xprtqk@gmail.com", password: "Klaro-QA-Test-9x7Kp2!" }) })).json();
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const name = `sb-${REF}-auth-token`, domain = new URL(BASE).hostname, CHUNK = 3180;
const cookies = value.length <= CHUNK ? [{ name, value, domain, path: "/", secure: true, sameSite: "Lax" }]
  : value.match(new RegExp(`.{1,${CHUNK}}`, "g")).map((v, i) => ({ name: `${name}.${i}`, value: v, domain, path: "/", secure: true, sameSite: "Lax" }));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png"), fullPage: true }); } catch {} };

// ── Retainer: generate stream + verify it lists + LiveCounter ticks ──
await page.goto(BASE + "/vendor/retainer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("button:has-text('Generate stream request')", { timeout: 15000 });
await page.getByPlaceholder(/Stellar Labs|client/i).fill("QA Client Co");
await page.getByPlaceholder(/0x/i).first().fill("0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677");
const nums = page.locator('input[type="number"]');
await nums.nth(0).fill("9000");
await nums.nth(1).fill("30");
await page.locator("button:has-text('Generate stream request')").click();
await page.waitForTimeout(3000);
const rb1 = await page.evaluate(() => document.body.innerText).catch(() => "");
const listed = /QA Client Co/i.test(rb1);
const v1 = (rb1.match(/\d+\.\d{3,}/g) || [])[0] || "";
await page.waitForTimeout(4000);
const rb2 = await page.evaluate(() => document.body.innerText).catch(() => "");
const v2 = (rb2.match(/\d+\.\d{3,}/g) || [])[0] || "";
await shot("retainer-after");
console.log(`retainer: stream listed=${listed} | digest=${/Server Components render/i.test(rb1)} | vested v1=${v1} v2=${v2} ticked=${v1 !== v2 && !!v1}`);

// ── Delegations: issue session key → revoke ──
await page.goto(BASE + "/vendor/delegations", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("button:has-text('Issue session key')", { timeout: 15000 });
await page.getByPlaceholder(/Accounting bot|Stripe/i).fill("QA automation bot");
await page.getByPlaceholder(/0x/i).first().fill("0x2a369C18C59aD000668e0329dA4b2122317e22C9");
await page.locator("select").first().selectOption({ index: 1 }).catch(() => {});
await page.locator('input[type="number"]').first().fill("24");
await page.locator("button:has-text('Issue session key')").click();
await page.waitForTimeout(3000);
const db1 = await page.evaluate(() => document.body.innerText).catch(() => "");
const keyListed = /QA automation bot/i.test(db1);
await shot("delegations-issued");
const revoke = page.locator("button", { hasText: /revoke/i }).first();
let revoked = false;
if (await revoke.isVisible({ timeout: 5000 }).catch(() => false)) {
  await revoke.click().catch(() => {});
  await page.waitForTimeout(3000);
  const db2 = await page.evaluate(() => document.body.innerText).catch(() => "");
  revoked = !/QA automation bot/i.test(db2) || /revoked/i.test(db2);
}
await shot("delegations-revoked");
console.log(`delegations: key issued+listed=${keyListed} | digest=${/Server Components render/i.test(db1)} | revoke worked=${revoked}`);
console.log("screenshots:", shots);
await browser.close();
