// FX-quote persistence UI E2E — proves the T1 honest-mode fix: the quote +
// settle paths now persist to fx_quotes (0042) instead of vanishing in live
// mode. The FX itself is already labeled honestly (simulated / access pending /
// demo completed) — StableFX access is partner-pending, so "settlement
// complete" is the demo terminal state, not an on-chain swap. No wallet needed.
//   VENDOR magic-link login -> /fx -> request a USDC->USYC quote
//   -> fx_quotes row persists (status simulated, not settled)
//   -> Execute swap -> status flips to settlement complete + settled_at set.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-fx.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    o[l.slice(0, i).trim()] = l
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
const VENDOR_ID = "989f0a85-82e8-409b-b7d3-206e73118113";
let n = 0;
const log = (...a: unknown[]) => console.log(`[fx ${++n}]`, ...a);
const admin = createClient(
  local.SUPABASE_URL,
  local.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
};

// Isolate the run: clear any leftover QA quotes for this vendor (id prefix).
await admin
  .from("fx_quotes")
  .delete()
  .eq("vendor_id", VENDOR_ID)
  .like("id", "fx_%");

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/fx")}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const loginPage = await ctx.newPage();
await loginPage.goto(callback, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await loginPage.waitForTimeout(2500);
await loginPage.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message.slice(0, 160)));
await page.goto(`${BASE}/fx`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
if (/\/signin/.test(page.url())) {
  console.error("session not established");
  await browser.close();
  process.exit(2);
}

// ── honest labels ─────────────────────────────────────────────────────
const honest = await page
  .evaluate(() => {
    const t = document.body.innerText;
    return (
      /mock rates show the full flow/i.test(t) &&
      /every quote below reflects its real state/i.test(t)
    );
  })
  .catch(() => false);
check("UI: honest 'mock rates / real state' FX labels", honest);

// ── request a quote (USDC -> USYC, status 'simulated') ────────────────
await page.locator('select[name="dst"]').first().selectOption("USYC");
await page.locator('input[name="amount"]').first().fill("1500");
await page
  .getByRole("button", { name: /^Quote$/i })
  .first()
  .click();
await page.waitForTimeout(2500);

const { data: rows } = await admin
  .from("fx_quotes")
  .select("id,src_token,dst_token,src_amount_usdc,dst_amount,status,settled_at")
  .eq("vendor_id", VENDOR_ID)
  .order("created_at", { ascending: false })
  .limit(1);
const row = rows?.[0];
log(
  "db row:",
  row
    ? `${row.src_token}->${row.dst_token} src=${row.src_amount_usdc} status=${row.status}`
    : "(none)",
);
check(
  "DB: fx_quotes row persisted (USDC->USYC, 1500 USDC, simulated, not settled)",
  !!row &&
    row.src_token === "USDC" &&
    row.dst_token === "USYC" &&
    BigInt(row.src_amount_usdc ?? "0") === 1_500_000_000n &&
    row.status === "simulated" &&
    row.settled_at === null,
);
const quoteId = row?.id as string | undefined;

// ── execute swap (settle) ─────────────────────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
const appears = await page
  .getByText(/USDC\s*→\s*USYC/i)
  .first()
  .isVisible()
  .catch(() => false);
check("UI: quote appears in the recent-quotes list (persists)", appears);

const swapBtn = page.getByRole("button", { name: /Execute swap/i }).first();
if (await swapBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
  // DOM-level click: the per-card form button can sit under the dev-mode shell
  // overlay at the page bottom; this submits the server-action form directly.
  await swapBtn
    .evaluate((el) => (el as HTMLButtonElement).click())
    .catch((e) => log("swap click:", String(e).slice(0, 100)));
  await page.waitForTimeout(3000);
}
const { data: afterS } = await admin
  .from("fx_quotes")
  .select("status,settled_at")
  .eq("id", quoteId ?? "");
const s = afterS?.[0];
check(
  "DB: settle flipped status to settlement complete + settled_at (demo terminal state)",
  s?.status === "settlement complete" && !!s?.settled_at,
  s?.status ?? "null",
);
const completedBadge = await page
  .evaluate(() => /Demo completed/i.test(document.body.innerText))
  .catch(() => false);
check("UI: quote badge flips to 'Demo completed'", completedBadge);

await browser.close();
console.log(`\nFX_QUOTE_ID=${quoteId ?? ""}`);
console.log(`FX_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
