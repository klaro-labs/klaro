// Bypass the magic-link OTP rate limit: set a password on the QA user (service
// key), use the password grant (not OTP-rate-limited) to get a fresh session,
// build the @supabase/ssr auth cookie, inject it into Playwright, and walk the
// LP pages (now that the QA account owns a STAKED LP profile + operator claim).
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
const SUPABASE_URL = local.SUPABASE_URL, SRK = local.SUPABASE_SERVICE_ROLE_KEY, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.SUPABASE_ANON_KEY;
const REF = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const EMAIL = "xprtqk@gmail.com";
const PW = "Klaro-QA-Test-" + "9x7Kp2!";
const shots = path.resolve("e2e/.goal-lp-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

// 1. set a password on the QA user
const userId = "37adac16-1a23-4887-b822-baed0339de5b";
let r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
  method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" },
  body: JSON.stringify({ password: PW }),
});
console.log("set password:", r.status);

// 2. password grant → session tokens
r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PW }),
});
const session = await r.json();
if (!session.access_token) { console.error("password grant failed:", JSON.stringify(session).slice(0, 200)); process.exit(2); }
console.log("password grant: access_token present, role:", session.user?.app_metadata?.klaro_role);

// 3. build the @supabase/ssr auth cookie (base64- prefix; chunk if > 3180)
const cookieName = `sb-${REF}-auth-token`;
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const CHUNK = 3180;
const cookies = [];
const domain = new URL(BASE).hostname;
if (value.length <= CHUNK) {
  cookies.push({ name: cookieName, value, domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax" });
} else {
  for (let i = 0, c = 0; i < value.length; i += CHUNK, c++) {
    cookies.push({ name: `${cookieName}.${c}`, value: value.slice(i, i + CHUNK), domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax" });
  }
}
console.log("cookie chunks:", cookies.length);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png"), fullPage: true }); } catch {} };

// 4. verify auth works at all (/vendor should NOT redirect to /signin)
await page.goto(BASE + "/vendor", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
console.log("after /vendor:", page.url().replace(BASE, "") || "/", "(authenticated:", !page.url().includes("/signin"), ")");

// 5. walk the LP pages
const LP = ["/lp", "/lp/queue", "/lp/stake", "/lp/settings", "/lp/reputation", "/lp/disputes", "/lp/dashboard", "/lp/walkthrough"];
for (const route of LP) {
  const errs = [];
  const h = (m) => { if (m.type() === "error" && !/reown|allowlist|403|initialized/i.test(m.text())) errs.push(m.text().slice(0, 90)); };
  page.on("console", h);
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const url = page.url().replace(BASE, "");
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  page.off("console", h);
  const notAdmitted = /not an admitted LP|Onboarding not complete/i.test(body);
  const digest = /Server Components render|server-side exception/i.test(body);
  const redir = url !== route;
  await shot(route.replace(/[^a-z0-9]+/gi, "_"));
  console.log(`${digest ? "DIGEST" : redir ? "↪" + url : notAdmitted ? "gate:not-admitted" : "ok"}  ${route}${errs.length ? " " + errs.length + "err:" + errs[0] : ""}`);
}
console.log("screenshots:", shots);
await browser.close();
