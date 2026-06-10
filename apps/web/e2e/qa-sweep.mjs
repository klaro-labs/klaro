// Klaro launch QA — exhaustive route sweep (Phase 1).
// Logs in each persona via the real /auth/callback magic-link path, then visits
// every route at desktop (1280) and mobile (390x844). Per route captures: HTTP
// status, console errors, page errors, error-boundary text, stale-domain leaks,
// and a screenshot. Emits internal/qa/run-2026-06-10/phase1/report.json + .md.
//
// Run from apps/web:  node e2e/qa-sweep.mjs [group]
//   group = public | vendor | lp | admin | all   (default all)
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
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
const e = env(".env.local");
const BASE = process.env.QA_BASE ?? "http://localhost:3000";
const OUT = path.resolve("../../internal/qa/run-2026-06-10/phase1");
mkdirSync(OUT, { recursive: true });

// Real IDs pulled from the DB for dynamic routes.
const ID = {
  invoice: "0xd212a692b3ac905ce2b36e643b5fc4e16823ebb27c7fb990ef929ece325b0cd1",
  receipt: "0x8d6a6d2d8757307acc8d409d1db0de280d852bc11b14be3fc02c0213e53c0e43",
  linkSlug: "EnCNSHSe",
  cashout: "0xdf1324bca6fc4da57cff0862fb5259952898f7da279dfe303f7cc119201f2160",
};

const PERSONA_EMAIL = {
  vendor: "prtk8899+vendor@gmail.com",
  lp: "prtk8899+lp@gmail.com",
  admin: "prtk8899+admin@gmail.com",
};

const ROUTES = {
  public: [
    "/", "/pricing", "/product", "/product/invoicing", "/product/cashout",
    "/product/receipts", "/product/reputation", "/product/stablefx",
    "/developers", "/build", "/docs", "/roadmap", "/resources",
    "/resources/flows", "/company", "/company/contact", "/brand-kit",
    "/trust", "/help", "/status", "/agents", "/fx", "/fx/brla", "/x402-demo",
    "/offline", "/signin", "/onboarding",
    "/legal/terms", "/legal/privacy", "/legal/cookies", "/legal/dpa",
    "/legal/subprocessors", "/legal/acceptable-use", "/legal/disclosures",
    `/i/${ID.invoice}`, `/pay/${ID.linkSlug}`, `/receipt/${ID.receipt}`,
  ],
  vendor: [
    "/vendor", "/vendor/invoices", "/vendor/invoices/new",
    "/vendor/invoices/import", "/vendor/invoices/recurring", "/vendor/links",
    "/vendor/links/new", "/vendor/cashout", "/vendor/financing",
    "/vendor/disputes", "/vendor/reputation", "/vendor/agents",
    "/vendor/delegations", "/vendor/retainer", "/vendor/transit",
    "/vendor/trust-center", "/vendor/team", "/vendor/settings",
    "/vendor/exports", "/vendor/integrations/erp",
    "/vendor/integrations/webhooks", "/vendor/bills", "/account/privacy",
  ],
  lp: [
    "/lp", "/lp/apply", "/lp/dashboard", "/lp/stake", "/lp/queue",
    "/lp/reputation", "/lp/disputes", "/lp/disputes-explainer", "/lp/docs",
    "/lp/walkthrough", "/lp/settings",
  ],
  admin: [
    "/admin", "/admin/disputes", "/admin/case-management",
    "/admin/manual-review", "/admin/risk-holds", "/admin/sanctions",
    "/admin/limits", "/admin/audit-log", "/internal/kpi",
  ],
};

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const admin = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function storageStateFor(persona) {
  const email = PERSONA_EMAIL[persona];
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink ${persona}: ${error.message}`);
  const tokenHash = data.properties?.hashed_token;
  const callback = `${BASE}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent("/vendor")}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  const state = await ctx.storageState();
  await browser.close();
  return state;
}

function slug(p) {
  return p.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "root";
}

const results = [];

async function sweep(group, routes, storageState) {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState,
    });
    for (const route of routes) {
      const page = await ctx.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
      page.on("pageerror", (err) => pageErrors.push(err.message.slice(0, 200)));
      let status = 0;
      try {
        const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        status = resp?.status() ?? 0;
        await page.waitForTimeout(1200);
      } catch (err) {
        pageErrors.push(`navigation: ${err.message.slice(0, 120)}`);
      }
      const body = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
      const finalUrl = page.url();
      const dir = path.join(OUT, group, vp.name);
      mkdirSync(dir, { recursive: true });
      const shot = path.join(dir, `${slug(route)}.png`);
      await page.screenshot({ path: shot, fullPage: vp.name === "desktop" }).catch(() => {});
      results.push({
        group, viewport: vp.name, route, status, finalUrl,
        redirectedToSignin: /\/signin/.test(finalUrl) && route !== "/signin",
        errorBoundary: /Application error|Unhandled Runtime Error|client-side exception|Internal Server Error|This page could not be found/i.test(body),
        staleDomain: /klaro\.so|klaro\.me/i.test(body),
        emptyBody: body.trim().length < 40,
        consoleErrors,
        pageErrors,
        bodyLen: body.length,
        shot: path.relative(path.resolve("../.."), shot),
      });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

const want = process.argv[2] ?? "all";
const groups = want === "all" ? ["public", "vendor", "lp", "admin"] : [want];

for (const g of groups) {
  const persona = g === "public" ? null : g;
  const state = persona ? await storageStateFor(persona) : undefined;
  console.log(`sweeping ${g} (${ROUTES[g].length} routes x ${VIEWPORTS.length} viewports)...`);
  await sweep(g, ROUTES[g], state);
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));

// Markdown summary — only the rows that need a human's eye.
const issues = results.filter(
  (r) => r.status >= 400 || r.status === 0 || r.redirectedToSignin || r.errorBoundary || r.staleDomain || r.emptyBody || r.consoleErrors.length || r.pageErrors.length,
);
const lines = [`# Phase 1 sweep — ${results.length} page-loads, ${issues.length} flagged`, ""];
for (const r of issues) {
  const flags = [];
  if (r.status >= 400 || r.status === 0) flags.push(`HTTP ${r.status}`);
  if (r.redirectedToSignin) flags.push("→signin");
  if (r.errorBoundary) flags.push("ERROR-BOUNDARY");
  if (r.staleDomain) flags.push("STALE-DOMAIN");
  if (r.emptyBody) flags.push("EMPTY");
  if (r.consoleErrors.length) flags.push(`console:${r.consoleErrors.length}`);
  if (r.pageErrors.length) flags.push(`pageerr:${r.pageErrors.length}`);
  lines.push(`- **${r.group}/${r.viewport}** \`${r.route}\` — ${flags.join(", ")}`);
  for (const c of r.consoleErrors.slice(0, 3)) lines.push(`    - console: ${c}`);
  for (const c of r.pageErrors.slice(0, 3)) lines.push(`    - pageerr: ${c}`);
}
writeFileSync(path.join(OUT, "report.md"), lines.join("\n"));
console.log(`\nDONE — ${results.length} loads, ${issues.length} flagged. Report: ${path.relative(path.resolve("../.."), path.join(OUT, "report.md"))}`);
