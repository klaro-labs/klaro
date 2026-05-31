// LP-profile persistence UI E2E — proves the T1 honest-mode fix: the LP write
// actions (rotate payout wallet, stake, apply, approve) now persist to
// lp_profiles (dual-mode lib/repo/lp.ts) instead of vanishing in live mode, with
// the app<->DB lp_status enum reconciled. On-chain LPStaking custody stays
// partner-pending (labeled honestly — no USDC pulled). No wallet needed.
//   Provision an APPROVED LP for the test vendor (service-role) ->
//   VENDOR magic-link login -> /lp/settings -> Rotate payout wallet ->
//   lp_profiles.wallet updates -> /lp/stake -> Confirm stake $100 ->
//   lp_profiles staked_usdc=100, tier=1, status=STAKED.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-lp.ts
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
const VENDOR_USER_ID = "37adac16-1a23-4887-b822-baed0339de5b";
const LP_ID = "lp_qa_e2e";
const INITIAL_WALLET = "0x1111111111111111111111111111111111111111";
const NEW_WALLET = "0x2222222222222222222222222222222222222222";
let n = 0;
const log = (...a: unknown[]) => console.log(`[lp ${++n}]`, ...a);
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

// ── provision an APPROVED LP for the test vendor (idempotent) ──────────
async function cleanup() {
  const { data: existing } = await admin
    .from("lp_profiles")
    .select("id")
    .eq("lp_id", LP_ID);
  for (const p of existing ?? []) {
    await admin.from("lp_members").delete().eq("lp_id", p.id);
  }
  await admin.from("lp_profiles").delete().eq("lp_id", LP_ID);
}
await cleanup();
const nowIso = new Date().toISOString();
const { data: prof, error: profErr } = await admin
  .from("lp_profiles")
  .insert({
    lp_id: LP_ID,
    supabase_user_id: VENDOR_USER_ID,
    contact_email: "lpqa.e2e@klaro.test",
    legal_entity_name: "QA Capital Ltd",
    country: "IN",
    wallet: INITIAL_WALLET,
    tier: 0,
    staked_usdc: 0,
    active_exposure_usdc: 0,
    status: "APPROVED",
    invited_at: nowIso,
    approved_at: nowIso,
    updated_at: nowIso,
  })
  .select("id")
  .single();
if (profErr || !prof) {
  console.error("lp_profiles provision failed", profErr?.message);
  process.exit(2);
}
const { error: memErr } = await admin.from("lp_members").insert({
  lp_id: prof.id,
  vendor_id: VENDOR_ID,
  role: "owner",
});
if (memErr) {
  console.error("lp_members provision failed", memErr.message);
  process.exit(2);
}
log("provisioned LP", LP_ID, "->", prof.id);

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/lp/settings")}`;

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
await page.goto(`${BASE}/lp/settings`, {
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

// the LP session resolved (not the "not an LP" forbid) → the page renders the
// Payout-wallet section with the seeded current wallet.
const lpResolved = await page
  .evaluate(
    (w) =>
      /Payout wallet/i.test(document.body.innerText) &&
      document.body.innerText.includes(w),
    `${INITIAL_WALLET.slice(0, 6)}…${INITIAL_WALLET.slice(-4)}`,
  )
  .catch(() => false);
check("UI: LP session resolved + seeded payout wallet shown", lpResolved);

// ── rotate payout wallet ──────────────────────────────────────────────
await page.locator('input[name="nextWallet"]').first().fill(NEW_WALLET);
const rotateBtn = page.getByRole("button", { name: /^Rotate$/ }).first();
await rotateBtn
  .evaluate((el) => (el as HTMLButtonElement).click())
  .catch((e) => log("rotate click:", String(e).slice(0, 100)));
await page.waitForTimeout(2500);
const { data: afterRot } = await admin
  .from("lp_profiles")
  .select("wallet")
  .eq("lp_id", LP_ID);
const rotWallet = String(afterRot?.[0]?.wallet ?? "");
log("wallet after rotate:", rotWallet);
check(
  "DB: rotate persisted new payout wallet to lp_profiles",
  rotWallet.toLowerCase() === NEW_WALLET.toLowerCase(),
  rotWallet,
);

// ── stake $100 (status APPROVED -> STAKED, tier 1) ────────────────────
await page.goto(`${BASE}/lp/stake`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
const stakeHonest = await page
  .evaluate(() =>
    /no USDC is pulled or locked on-chain/i.test(document.body.innerText),
  )
  .catch(() => false);
check("UI: honest 'no USDC pulled on-chain' stake label", stakeHonest);

await page.locator('input[name="amount"]').first().fill("100");
const stakeBtn = page
  .getByRole("button", { name: /Confirm stake|Update stake/i })
  .first();
await stakeBtn
  .evaluate((el) => (el as HTMLButtonElement).click())
  .catch((e) => log("stake click:", String(e).slice(0, 100)));
await page.waitForTimeout(2500);
const { data: afterStake } = await admin
  .from("lp_profiles")
  .select("staked_usdc,tier,status")
  .eq("lp_id", LP_ID);
const st = afterStake?.[0];
log(
  "after stake:",
  st
    ? `staked=${st.staked_usdc} tier=${st.tier} status=${st.status}`
    : "(none)",
);
check(
  "DB: stake persisted staked_usdc=100, tier=1, status=STAKED (enum mapped)",
  Number(st?.staked_usdc) === 100 &&
    Number(st?.tier) === 1 &&
    st?.status === "STAKED",
  st ? `${st.staked_usdc}/T${st.tier}/${st.status}` : "null",
);
const stakedBadge = await page
  .reload({ waitUntil: "domcontentloaded" })
  .then(() => page.waitForTimeout(1200))
  .then(() =>
    page.evaluate(() =>
      /100\.00 staked|staked · T1/i.test(document.body.innerText),
    ),
  )
  .catch(() => false);
check("UI: stake badge reflects staked tier", stakedBadge);

await browser.close();
await cleanup();
log("cleaned up provisioned LP");
console.log(`\nLP_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
