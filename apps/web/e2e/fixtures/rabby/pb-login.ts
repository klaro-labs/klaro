// P-B step 1: mint a real Supabase session for the QA vendor and land logged in
// inside the Rabby browser context. Verifies the headless-login path works
// before we drive the publish flow.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { launchRabby, unlockRabby } from "./rabby-driver.js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}

const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
const VENDOR_EMAIL = "xprtqk@gmail.com";
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

// 1. mint a magic-link token_hash via service role (no email needed)
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: VENDOR_EMAIL,
});
if (error) { console.error("generateLink ERR:", error.message); process.exit(2); }
const tokenHash = data.properties?.hashed_token;
console.log("token_hash minted:", tokenHash ? "yes (len " + tokenHash.length + ")" : "MISSING");
if (!tokenHash) process.exit(3);

const callback = `${BASE}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/new")}`;

// 2. launch Rabby browser, navigate the callback → logged in
const { context } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile") });
const page = await context.newPage();
await unlockRabby(page).catch(() => {});
await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(shots, "after-login.png") }).catch(() => {});

const url = page.url();
const onSignin = /\/signin/.test(url);
const formVisible = await page
  .locator("#invoice-form, form")
  .first()
  .isVisible({ timeout: 5000 })
  .catch(() => false);
const bodySnippet = (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 200).replace(/\s+/g, " ");

console.log("final url:", url);
console.log("on /signin (login FAILED if true):", onSignin);
console.log("invoice form visible:", formVisible);
console.log("body:", bodySnippet);

await context.close();
process.exit(!onSignin && formVisible ? 0 : 4);
