// P-C cross-user sync: the buyer paid + settled invoice 0xbd11 — does the
// VENDOR's dashboard reflect it? Logs in as the QA vendor (token_hash, no
// wallet needed for a read-only view) and checks the invoice list + detail
// render SETTLED + a receipt link. Verifies buyer's action → vendor's view.
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
const BASE = "http://localhost:3100"; // auth cookie is origin-scoped — must match the site origin (not 127.0.0.1)
const INVOICE = "0xbd11239f93407b52f7d43b66f4f1af19c251c5c400613cb533cc138ea4455933";
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[vv ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
if (error || !link.properties?.hashed_token) { console.error("login mint failed", error?.message); process.exit(2); }
const cb = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/" + INVOICE)}`;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(cb, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on:", page.url());
await page.screenshot({ path: path.join(shots, "vendor-detail.png") }).catch(() => {});
const body = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
const showsSettled = /Settled/i.test(body);
const showsReceipt = /receipt/i.test(body) && /\/receipt\//.test(await page.content().catch(() => ""));
const onSignin = /\/signin/.test(page.url());
log("logged in (not on signin):", !onSignin);
log("detail shows 'Settled':", showsSettled);
log("detail has a receipt link:", showsReceipt);
log("detail body (first 320):", body.slice(0, 320));

// also load the list and confirm the invoice appears under 'paid'
await page.goto(`${BASE}/vendor/invoices?filter=paid`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1000);
const listBody = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
const inList = listBody.toLowerCase().includes("bd11") || /Settled/i.test(listBody);
log("appears in vendor 'paid' list:", inList);

try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
const ok = !onSignin && showsSettled;
console.log("VENDOR_VIEW_OK=" + ok);
process.exit(ok ? 0 : 1);
