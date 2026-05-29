// Verify vendor onboarding (real-human, fresh user): fresh email → login →
// /onboarding step 1 (Business) renders → fill displayName/country → RELOAD →
// values persist (P0-1 persist-on-blur survives refresh). No wallet needed
// (wallet step has a "later" option). Records video.
import { readFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file) { const o = {}; for (const l of readFileSync(file, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
const shots = path.resolve("e2e/.pb-vid");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[onboard ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// fresh email → auto-creates a new user/workspace → lands on onboarding
const rand = randomBytes(4).toString("hex");
const email = `qa-onboard-${rand}@example.com`;
log("fresh email:", email);
// generateLink('magiclink') needs the user to exist — create it first (auto-confirmed)
const { error: cuErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (cuErr && !/already/i.test(cuErr.message)) log("createUser warn:", cuErr.message);
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error || !link.properties?.hashed_token) { console.error("mint failed", error?.message); process.exit(2); }
const cb = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/onboarding")}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: shots, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") log("page-err:", m.text().slice(0, 120)); });

await page.goto(cb, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
log("after login url:", page.url());
const body1 = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
const onOnboarding = /onboard|Business|displayName|Let.s set up|workspace|Step 1|wallet/i.test(body1) && !/\/signin/.test(page.url());
log("reached onboarding:", onOnboarding, "| body:", body1.slice(0, 160));

// fill step 1 (Business): displayName + country (text inputs)
const DISPLAY = `QA Onboard Co ${rand}`;
const textInputs = page.locator('input[type="text"], input:not([type])');
const cnt = await textInputs.count();
log("text inputs found:", cnt);
let filled = false;
if (cnt >= 1) {
  await textInputs.nth(0).fill(DISPLAY).catch(() => {});
  if (cnt >= 2) await textInputs.nth(1).fill("IN").catch(() => {});
  await page.waitForTimeout(400);
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {}); // blur → persist
  await page.waitForTimeout(1500);
  filled = true;
}

// RELOAD → check persistence
await page.reload({ waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const persisted = await page.evaluate((d) => {
  const inputs = [...document.querySelectorAll('input')];
  return inputs.some((i) => i.value === d);
}, DISPLAY);
log("displayName persisted across reload:", persisted);

await context.close();
const vids = readdirSync(shots).filter((f) => f.endsWith(".webm"));
log("video:", vids[0] || "none", "(deleted)");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
console.log("ONBOARD_OK=" + (onOnboarding && filled && persisted));
process.exit(onOnboarding && persisted ? 0 : 1);
