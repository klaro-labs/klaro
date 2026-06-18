// GOAL loop iteration — drive dispute-open, team-invite, agent-hire submits on
// LIVE and hunt for the cashout-class failure (500 / "Server Components render"
// digest). DB-only writes, no wallet. Verifies row creation + flags any digest.
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
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const TAG = process.env.KLARO_RUN_TAG || "qa";
const shots = path.resolve("e2e/.goal-action-shots");
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[a3 ${++n}]`, ...a);
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: vrow } = await admin.from("vendors").select("id").eq("email", "xprtqk@gmail.com").maybeSingle();
const vendorId = vrow.id;
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
let consoleErrs = [];
page.on("console", (m) => { if (m.type() === "error" && !/reown|allowlist|403/i.test(m.text())) consoleErrs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrs.push("pageerror: " + String(e).slice(0, 160)));
await page.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor")}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png") }); } catch {} };
const results = {};
async function digestOnPage() { const b = await page.evaluate(() => document.body.innerText).catch(() => ""); return /Server Components render|application error: a server-side exception/i.test(b); }
async function count(table) { return (await admin.from(table).select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? -1; }

// ── 1. Dispute open ─────────────────────────────────────────────────────────
try {
  consoleErrs = [];
  const before = await count("disputes");
  await page.goto(BASE + "/vendor/disputes", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Open dispute')", { timeout: 15000 });
  // entry point defaults to a Cashout type → use the real cashout id; fill the
  // required Respondent field (was left on its placeholder before).
  await page.fill('input[placeholder*="0x"]', "0x060ee76ff600addf4ae3ecb6561f845a0a3725bc340b84459c2d8358f4b77c58").catch(() => {});
  await page.fill('input[placeholder*="Mudrex"], input[placeholder*="other party"]', "QA Respondent LLC").catch(() => {});
  await page.fill('textarea', `QA loop ${TAG}: buyer says wrong amount received, no funds landed after 4 hours — opening a test case.`).catch(() => {});
  await shot("D1-dispute-filled");
  await page.locator("button:has-text('Open dispute')").click();
  await page.waitForTimeout(3500);
  const digest = await digestOnPage();
  const after = await count("disputes");
  await shot("D2-dispute-after");
  results.dispute = digest ? "DIGEST/500 ERROR" : after > before ? `PASS (disputes ${before}→${after})` : `CHECK (count ${before}→${after}, errs=${consoleErrs.length})`;
  if (consoleErrs.length) results.dispute += " | console: " + consoleErrs[0];
} catch (e) { results.dispute = "ERR " + String(e).slice(0, 120); }
log("dispute:", results.dispute);

// ── 2. Team invite ──────────────────────────────────────────────────────────
if (!process.env.KLARO_ONLY_DISPUTE) try {
  consoleErrs = [];
  const before = await count("vendor_team_members");
  await page.goto(BASE + "/vendor/team", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Invite')", { timeout: 15000 });
  await page.fill('input[type="email"], input[placeholder*="teammate"], input[placeholder*="company.com"]', `qa-teammate-${TAG}@example.com`).catch(() => {});
  await shot("T1-team-filled");
  await page.locator("button:has-text('Invite')").click();
  await page.waitForTimeout(3500);
  const digest = await digestOnPage();
  const after = await count("vendor_team_members");
  await shot("T2-team-after");
  results.team = digest ? "DIGEST/500 ERROR" : after > before ? `PASS (members ${before}→${after})` : `CHECK (count ${before}→${after}, errs=${consoleErrs.length}, body=${(await page.evaluate(() => document.body.innerText).catch(() => "")).match(/invit|error|sent|already|fail[^.]*/i)?.[0] ?? "?"})`;
  if (consoleErrs.length) results.team += " | console: " + consoleErrs[0];
} catch (e) { results.team = "ERR " + String(e).slice(0, 120); }
log("team:", results.team);

// ── 3. Agent hire ───────────────────────────────────────────────────────────
if (!process.env.KLARO_ONLY_DISPUTE) try {
  consoleErrs = [];
  const before = await count("agent_jobs");
  await page.goto(BASE + "/vendor/agents", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Open job')", { timeout: 15000 });
  // pick the first non-placeholder agent option if a select exists
  const sel = page.locator("select").first();
  if (await sel.isVisible({ timeout: 3000 }).catch(() => false)) {
    const opts = await sel.locator("option").allTextContents().catch(() => []);
    log("agent options:", opts.join(" | "));
    const idx = opts.findIndex((o) => !/pick|select|—/i.test(o));
    if (idx > 0) await sel.selectOption({ index: idx }).catch(() => {});
  }
  await page.locator('input[type="number"]').first().fill("150").catch(() => {});
  await page.fill('textarea', `QA loop ${TAG}: competitor pricing scan for our Q3 launch, top 5 incumbents.`).catch(() => {});
  await shot("G1-agent-filled");
  await page.locator("button:has-text('Open job')").click();
  await page.waitForTimeout(3500);
  const digest = await digestOnPage();
  const after = await count("agent_jobs");
  await shot("G2-agent-after");
  results.agent = digest ? "DIGEST/500 ERROR" : after > before ? `PASS (jobs ${before}→${after})` : `CHECK (count ${before}→${after}, errs=${consoleErrs.length}, body=${(await page.evaluate(() => document.body.innerText).catch(() => "")).match(/pick an agent|no agent|error|opened|fail[^.]*/i)?.[0] ?? "?"})`;
  if (consoleErrs.length) results.agent += " | console: " + consoleErrs[0];
} catch (e) { results.agent = "ERR " + String(e).slice(0, 120); }
log("agent:", results.agent);

await browser.close();
console.log("\n===== DISPUTE / TEAM / AGENT =====");
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(10), v);
