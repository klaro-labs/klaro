// GOAL — walk every ADMIN + LP + internal route now that the QA account has
// operator + LP-owner roles. Fresh token_hash login carries the new operator
// JWT claim. Capture console/digest/body errors + screenshot each.
import { chromium } from "playwright";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

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
const shots = path.resolve("e2e/.goal-adminlp-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });

const SUPABASE_URL = local.SUPABASE_URL, SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const r = await fetch(SUPABASE_URL + "/auth/v1/admin/generate_link", {
  method: "POST", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: "xprtqk@gmail.com" }),
});
const link = await r.json();
const th = link.properties?.hashed_token;
const callback = `${BASE}/auth/callback?token_hash=${th}&type=magiclink&next=${encodeURIComponent("/admin")}`;

const ADMIN = ["/admin", "/admin/audit-log", "/admin/case-management", "/admin/disputes", "/admin/limits", "/admin/manual-review", "/admin/risk-holds", "/admin/sanctions"];
const LP = ["/lp", "/lp/apply", "/lp/dashboard", "/lp/disputes", "/lp/disputes-explainer", "/lp/docs", "/lp/queue", "/lp/reputation", "/lp/settings", "/lp/stake", "/lp/walkthrough"];
const INTERNAL = ["/internal/kpi"];

const ctx = await chromium.launch({ headless: true }).then((b) => b.newContext({ viewport: { width: 1280, height: 900 } }));
const page = await ctx.newPage();
await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
console.log("login →", page.url());
const results = [];

async function walk(label, routes) {
  for (const route of routes) {
    const errs = [];
    const onC = (m) => { if (m.type() === "error" && !/reown|allowlist|403|already initialized/i.test(m.text())) errs.push("console: " + m.text().slice(0, 150)); };
    const onP = (e) => errs.push("pageerror: " + String(e).slice(0, 150));
    page.on("console", onC); page.on("pageerror", onP);
    let status = 0, finalUrl = "", digest = false, bodyErr = false;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = resp?.status() ?? 0;
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      digest = /Server Components render|server-side exception/i.test(body);
      bodyErr = /\[object Object\]|undefined is not|cannot read prop|TypeError|Unhandled Runtime/i.test(body);
    } catch (e) { errs.push("goto: " + String(e).slice(0, 120)); }
    await page.screenshot({ path: path.join(shots, (label + route).replace(/[^a-z0-9]+/gi, "_") + ".png"), fullPage: true }).catch(() => {});
    page.off("console", onC); page.off("pageerror", onP);
    const redirected = !finalUrl.includes(route) && route !== "/";
    const bad = errs.length > 0 || status >= 400 || digest || bodyErr;
    results.push({ route, status, finalUrl, redirected, digest, bodyErr, errs, bad });
    console.log(`${bad ? "✗" : redirected ? "↪" : "✓"} ${route} → ${status}${redirected ? " (→ " + finalUrl.replace(BASE, "") + ")" : ""}${digest ? " DIGEST" : ""}${bodyErr ? " BODYERR" : ""}${errs.length ? " " + errs.length + "err" : ""}`);
  }
}
await walk("admin", ADMIN);
await walk("lp", LP);
await walk("internal", INTERNAL);
await ctx.close();

const bad = results.filter((r) => r.bad);
const redir = results.filter((r) => r.redirected && !r.bad);
console.log(`\n===== ADMIN/LP WALK: ${results.length} pages, ${bad.length} with errors, ${redir.length} redirected (role gate?) =====`);
for (const b of bad) { console.log(`\n✗ ${b.route} (status ${b.status}${b.digest ? " DIGEST" : ""}${b.bodyErr ? " BODYERR" : ""})`); for (const e of b.errs) console.log("   - " + e); }
if (redir.length) { console.log("\nredirected (didn't render as that role):"); for (const x of redir) console.log("  ↪ " + x.route + " → " + x.finalUrl.replace(BASE, "")); }
console.log("\nscreenshots:", shots);
