// GOAL walk — log in as a real vendor (token_hash → /auth/callback) and visit
// EVERY page at desktop + mobile against the LIVE site, capturing console
// errors, page errors, failed network calls, and the "Server Components render"
// digest error per page. Evidence: screenshots in e2e/.goal-shots.
//
// Usage: node e2e/goal-walk.mjs            (live www.myklaro.app)
//        KLARO_E2E_BASE_URL=http://127.0.0.1:3007 node e2e/goal-walk.mjs   (local)
import { chromium } from "playwright";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

function env(file) {
  const o = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}

const local = env(path.resolve(".env.local"));
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const shots = path.resolve("e2e/.goal-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

// ── mint a real vendor session (token_hash → callback) ────────────────────
const SUPABASE_URL = local.SUPABASE_URL;
const SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const r = await fetch(SUPABASE_URL + "/auth/v1/admin/generate_link", {
  method: "POST",
  headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: "xprtqk@gmail.com" }),
});
const link = await r.json();
const th = link.properties?.hashed_token || link.hashed_token;
if (!th) { console.error("login mint failed:", JSON.stringify(link).slice(0, 200)); process.exit(2); }
const callback = `${BASE}/auth/callback?token_hash=${th}&type=magiclink&next=${encodeURIComponent("/vendor")}`;

// ── routes to walk ─────────────────────────────────────────────────────────
const PUBLIC = [
  "/", "/product", "/product/invoicing", "/product/cashout", "/product/receipts",
  "/product/reputation", "/product/stablefx", "/pricing", "/trust", "/status",
  "/resources", "/resources/flows", "/company", "/company/contact", "/roadmap",
  "/developers", "/docs", "/build", "/help", "/brand-kit", "/agents", "/fx",
  "/legal/terms", "/legal/privacy", "/legal/cookies", "/legal/dpa",
  "/legal/subprocessors", "/legal/acceptable-use", "/legal/disclosures",
];
const VENDOR = [
  "/vendor", "/vendor/invoices", "/vendor/invoices/new", "/vendor/invoices/recurring",
  "/vendor/invoices/import", "/vendor/links", "/vendor/links/new", "/vendor/cashout",
  "/vendor/settings", "/vendor/integrations/erp", "/vendor/integrations/webhooks",
  "/vendor/disputes", "/vendor/team", "/vendor/reputation", "/vendor/financing",
  "/vendor/bills", "/vendor/transit", "/vendor/agents", "/vendor/retainer",
  "/vendor/delegations", "/vendor/exports", "/account/privacy",
];
const OTHER = ["/lp", "/lp/apply", "/lp/queue", "/lp/dashboard", "/lp/settings", "/admin", "/internal/kpi"];

const context = await chromium.launch({ headless: true }).then((b) => b.newContext({ viewport: { width: 1280, height: 800 } }));
const results = [];

async function walk(label, routes, page) {
  for (const route of routes) {
    const errs = [];
    const onConsole = (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); };
    const onPageErr = (e) => errs.push("pageerror: " + String(e).slice(0, 160));
    const onFail = (req) => {
      const u = req.url();
      const err = req.failure()?.errorText || "";
      // Benign: Next.js cancels in-flight RSC prefetches on navigation → ERR_ABORTED.
      if (/[?&]_rsc=/.test(u) && /ABORT/i.test(err)) return;
      if (!/analytics|posthog|sentry|monitoring|growthbook|_vercel|fonts|\.(png|jpg|svg|woff)/i.test(u)) errs.push("netfail: " + u.slice(0, 120) + " " + err);
    };
    page.on("console", onConsole); page.on("pageerror", onPageErr); page.on("requestfailed", onFail);
    let status = 0, finalUrl = "", digest = false, bodyErr = false;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = resp?.status() ?? 0;
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      digest = /Server Components render|application error: a server-side exception|digest/i.test(body) && /error/i.test(body);
      bodyErr = /\[object Object\]|undefined is not|cannot read prop|TypeError|Unhandled Runtime/i.test(body);
    } catch (e) { errs.push("goto: " + String(e).slice(0, 120)); }
    const safe = (label + route).replace(/[^a-z0-9]+/gi, "_");
    await page.screenshot({ path: path.join(shots, safe + ".png"), fullPage: false }).catch(() => {});
    page.off("console", onConsole); page.off("pageerror", onPageErr); page.off("requestfailed", onFail);
    const bad = errs.length > 0 || status >= 400 || digest || bodyErr;
    results.push({ label, route, status, finalUrl, digest, bodyErr, errs, bad });
    console.log(`${bad ? "✗" : "✓"} [${label}] ${route} → ${status}${digest ? " DIGEST-ERROR" : ""}${bodyErr ? " BODY-ERR" : ""}${errs.length ? " " + errs.length + "err" : ""}`);
  }
}

// desktop pass — login first, then public + authed
const deskPage = await context.newPage();
await deskPage.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await deskPage.waitForTimeout(2000);
console.log("login →", deskPage.url());
await walk("desktop-public", PUBLIC, deskPage);
await walk("desktop-vendor", VENDOR, deskPage);
await walk("desktop-other", OTHER, deskPage);

// mobile pass — key user-facing screens
const mob = await context.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
await mob.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await mob.waitForTimeout(2000);
await walk("mobile", ["/", "/vendor", "/vendor/invoices/new", "/vendor/cashout", "/vendor/settings", "/pricing", "/signin"], mob);

await context.close();

// ── report ─────────────────────────────────────────────────────────────────
const bad = results.filter((r) => r.bad);
console.log(`\n===== GOAL WALK: ${results.length} page-loads, ${bad.length} with issues =====`);
for (const b of bad) {
  console.log(`\n✗ [${b.label}] ${b.route} (status ${b.status}${b.digest ? ", DIGEST ERROR" : ""}${b.bodyErr ? ", BODY ERR" : ""})`);
  for (const e of b.errs) console.log("   - " + e);
}
console.log(`\nscreenshots: ${shots}`);
process.exit(bad.length ? 1 : 0);
