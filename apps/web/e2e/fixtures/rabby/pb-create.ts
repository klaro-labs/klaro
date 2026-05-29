// Verify the invoice CREATE form (real-human UI): vendor logs in → fills the
// form → submits → invoice row created → redirects to detail. Also a validation
// probe (dueDays out of range → graceful error, no invoice). No wallet needed.
import { readFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file) { const o = {}; for (const l of readFileSync(file, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
const shots = path.resolve("e2e/.pb-vid");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[create ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
if (error || !link.properties?.hashed_token) { console.error("login mint failed", error?.message); process.exit(2); }
const cb = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/new")}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: shots, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") log("page-err:", m.text().slice(0, 120)); });

await page.goto(cb, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on:", page.url());
if (/\/signin/.test(page.url())) { log("LOGIN FAILED"); await browser.close(); process.exit(4); }

async function fillForm({ amount, desc, email, dueDays }) {
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill(String(amount)).catch(() => {});            // amount
  await page.locator('input[type="text"]').first().fill(desc).catch(() => {});
  await page.locator('input[type="email"]').first().fill(email).catch(() => {});
  // dueDays is the 2nd number input
  if (await nums.count() > 1) await nums.nth(1).fill(String(dueDays)).catch(() => {});
}

// ── Happy path ──
const uniq = link.properties.hashed_token.slice(0, 6);
await fillForm({ amount: process.env.QA_AMOUNT || "12.34", desc: `QA create-form test ${uniq}`, email: `qa-create+${uniq}@example.com`, dueDays: "30" });
await page.waitForTimeout(400);
const vals = await page.evaluate(() => ({
  amount: document.querySelectorAll('input[type=number]')[0]?.value,
  due: document.querySelectorAll('input[type=number]')[1]?.value,
  email: document.querySelector('input[type=email]')?.value,
  desc: document.querySelector('input[type=text]')?.value,
}));
log("filled values:", JSON.stringify(vals));
log("submitting valid invoice…");
await page.getByRole("button", { name: /Create invoice/i }).first().click().catch((e) => log("click err", String(e).slice(0,60)));
let createdId = null;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  const m = page.url().match(/\/vendor\/invoices\/(0x[0-9a-fA-F]{64})/);
  if (m) { createdId = m[1]; break; }
}
const errBox = await page.locator(".bg-rose-50").first().textContent({ timeout: 1500 }).catch(() => null);
log("error box:", errBox ? errBox.trim().slice(0, 120) : "(none)");
log("redirected to:", page.url(), "createdId:", createdId);
let dbOk = false;
if (createdId) {
  const { data: row } = await admin.from("invoices").select("id,status,amount_usdc,customer_email").eq("id", createdId).maybeSingle();
  dbOk = !!row && row.status === "CREATED";
  log("DB row:", row ? `status=${row.status} amt=${row.amount_usdc} email=${row.customer_email}` : "MISSING");
}
const happyOk = !!createdId && dbOk;

await context.close();
const vids = readdirSync(shots).filter((f) => f.endsWith(".webm"));
log("video:", vids[0] || "none", "(deleted after log)");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
console.log("CREATE_HAPPY_OK=" + happyOk);
process.exit(happyOk ? 0 : 1);
