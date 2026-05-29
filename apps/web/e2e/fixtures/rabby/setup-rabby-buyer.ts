/**
 * Import the QA buyer wallet (0x2a369C…, CUSTOMER_TEST_PRIVATE_KEY) into a
 * SEPARATE Rabby persistent profile (`e2e/.rabby-profile-buyer`) via the mapped
 * onboarding flow. Mirrors setup-rabby-vendor.ts so the buyer can pay through
 * real Rabby popups without clobbering the vendor profile (multi-wallet).
 * Run from apps/web:
 *   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/setup-rabby-buyer.ts
 */
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { launchRabby } from "./rabby-driver.js";

const RABBY_PASSWORD = process.env.RABBY_PASSWORD ?? "RabbyPass123!QA";
const profile = path.resolve("e2e/.rabby-profile-buyer");
const shots = path.resolve("e2e/.rabby-debug-buyer");
try { rmSync(profile, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

const walletsEnv = path.resolve("e2e/wallets/.env.test-wallets");
const m = readFileSync(walletsEnv, "utf8").match(/^\s*CUSTOMER_TEST_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})\s*$/m);
if (!m) { console.error("CUSTOMER_TEST_PRIVATE_KEY not found"); process.exit(3); }
const KEY = m[1].replace(/^0x/, "");

const { context, extId } = await launchRabby({ profileDir: profile });
console.log("EXT_ID", extId);
const page = await context.newPage();
const shot = (n: string) => page.screenshot({ path: path.join(shots, `imp-${n}.png`) }).catch(() => {});

await page.goto(`chrome-extension://${extId}/index.html#/new-user/guide`);
await page.waitForTimeout(1500);
await shot("0-guide");

await page.locator("button", { hasText: /I already have an address/i }).first().click();
await page.waitForTimeout(1200);
await shot("1-wallettype");

await page.locator("text=/Seed Phrase or Private Key/i").first().click();
await page.waitForTimeout(1200);
await shot("2-seedorkey");

// switch to the Private Key tab (default tab is Seed Phrase → 12 boxes)
await page.locator("text=/^Private Key$/").first().click().catch(() => {});
await page.waitForTimeout(800);
await shot("3-pktab");

const keyInput = page.locator('input[type="password"]:visible, textarea:visible').first();
await keyInput.waitFor({ state: "visible", timeout: 8000 });
await keyInput.fill(KEY);
await page.waitForTimeout(400);
await shot("4-keyfilled");

await page.locator("button", { hasText: /^Next$/i }).first().click();
await page.waitForTimeout(1500);
await shot("5-afternext");

const pwds = page.locator('input[type="password"]:visible');
const n = await pwds.count();
console.log("password fields on setup screen:", n);
if (n >= 1) {
  await pwds.nth(0).fill(RABBY_PASSWORD);
  if (n >= 2) await pwds.nth(1).fill(RABBY_PASSWORD);
  await page.waitForTimeout(300);
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) await cb.check().catch(() => {});
  await shot("6-pwfilled");
  await page.locator("button", { hasText: /Confirm|Next|Done|Finish|Get Started/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot("7-final");
}

const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
const imported = /0x2a369|2a369C|Dashboard|Send|Receive|Swap/i.test(bodyText);
console.log("IMPORT_LOOKS_DONE:", imported);
console.log("url:", page.url());
await context.close();
process.exit(imported ? 0 : 4);
