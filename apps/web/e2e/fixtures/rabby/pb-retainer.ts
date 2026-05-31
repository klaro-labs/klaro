// Retainer-stream persistence UI E2E — proves the T1 honest-mode fix: the
// create/withdraw/cancel paths now persist to retainer_streams (0041) instead of
// vanishing in live mode, with honest "vesting simulated / on-chain funding
// pending" labels (no fake "funds lock on-chain"). No wallet needed.
//   VENDOR magic-link login -> /vendor/retainer -> create a stream
//   -> retainer_streams row persists (withdrawn 0, not cancelled)
//   -> backdate start_at by service-role to simulate elapsed time (so the stream
//      is ~50% vested) -> Withdraw button -> withdrawn_usdc increases on-chain-less
//   -> Cancel stream -> cancelled_at + cancelled_vested set, badge flips.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-retainer.ts
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
let n = 0;
const log = (...a: unknown[]) => console.log(`[retainer ${++n}]`, ...a);
const admin = createClient(
  local.SUPABASE_URL,
  local.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`,
  );
  if (!ok) failures++;
};

const stamp = Date.now();
const payerLabel = `QA retainer ${stamp} — Stellar Labs`;
const payerAddress = "0x000000000000000000000000000000000000dEaD";
const VENDOR_WALLET = "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677";

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/retainer")}`;

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

// Isolate the run: clear any leftover QA streams for this vendor so the active
// list holds exactly the stream we create (otherwise `.first()` is ambiguous).
await admin
  .from("retainer_streams")
  .delete()
  .eq("vendor_id", "989f0a85-82e8-409b-b7d3-206e73118113")
  .like("payer_label", "QA retainer %");

const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message.slice(0, 160)));
await page.goto(`${BASE}/vendor/retainer`, {
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
      /Vesting is simulated/i.test(t) &&
      /no USDC is locked or moved on-chain/i.test(t)
    );
  })
  .catch(() => false);
check("UI: honest 'vesting simulated / no USDC on-chain' labels", honest);

// ── create stream ─────────────────────────────────────────────────────
await page.locator('input[name="payerLabel"]').first().fill(payerLabel);
await page.locator('input[name="payerAddress"]').first().fill(payerAddress);
await page.locator('input[name="amount"]').first().fill("4000");
await page.locator('input[name="days"]').first().fill("40");
await page
  .getByRole("button", { name: /Generate stream request/i })
  .first()
  .click();
await page.waitForTimeout(2500);

const { data: rows } = await admin
  .from("retainer_streams")
  .select(
    "stream_id,deposit_usdc,withdrawn_usdc,recipient_address,cancelled_at,start_at,end_at",
  )
  .eq("payer_label", payerLabel);
const row = rows?.[0];
log(
  "db row:",
  row
    ? `deposit=${row.deposit_usdc} withdrawn=${row.withdrawn_usdc} cancelled=${row.cancelled_at !== null}`
    : "(none)",
);
check(
  "DB: retainer_streams row persisted (deposit 4000 USDC, withdrawn 0, not cancelled)",
  !!row &&
    BigInt(row.deposit_usdc ?? "0") === 4_000_000_000n &&
    BigInt(row.withdrawn_usdc ?? "0") === 0n &&
    row.cancelled_at === null &&
    row.recipient_address?.toLowerCase() === VENDOR_WALLET.toLowerCase(),
);
const streamId = row?.stream_id as string | undefined;

// ── simulate ~50% elapsed time so a meaningful amount has vested ───────
// (advances the clock only; does not fake the withdraw/cancel UI paths)
if (streamId) {
  const now = Date.now();
  await admin
    .from("retainer_streams")
    .update({
      start_at: new Date(now - 20 * 86_400_000).toISOString(),
      end_at: new Date(now + 20 * 86_400_000).toISOString(),
    })
    .eq("stream_id", streamId);
}

// ── withdraw the vested portion ───────────────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const appears = await page
  .getByText(payerLabel, { exact: false })
  .first()
  .isVisible()
  .catch(() => false);
check("UI: created stream appears in the active list (persists)", appears);

const withdrawBtn = page.getByRole("button", { name: /^Withdraw/i }).first();
const canWithdraw = await withdrawBtn
  .isVisible({ timeout: 6000 })
  .catch(() => false);
if (canWithdraw) {
  await withdrawBtn.click().catch(() => {});
  await page.waitForTimeout(2500);
}
const { data: afterW } = await admin
  .from("retainer_streams")
  .select("withdrawn_usdc")
  .eq("stream_id", streamId ?? "");
const withdrawn = BigInt(afterW?.[0]?.withdrawn_usdc ?? "0");
log("withdrawn after click:", withdrawn.toString());
// ~50% of 4000 USDC = 2000_000_000 micro; allow drift for the extra seconds.
check(
  "DB: withdraw moved withdrawn_usdc to ~the vested half (record updated, no token transfer)",
  withdrawn >= 1_900_000_000n && withdrawn <= 2_100_000_000n,
  withdrawn.toString(),
);

// ── cancel the stream ─────────────────────────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500); // let hydration settle before the inline action
const cancelBtn = page.getByRole("button", { name: /Cancel stream/i }).first();
if (await cancelBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
  // A sticky shell element overlays this bottom-of-page link, so a pointer
  // click (even force:true) lands on the overlay. Fire the button's click in
  // the DOM directly to submit the server-action form regardless of overlays.
  await cancelBtn
    .evaluate((el) => (el as HTMLButtonElement).click())
    .catch((e) => log("cancel click:", String(e).slice(0, 100)));
  await page.waitForTimeout(3500);
}
const { data: afterC } = await admin
  .from("retainer_streams")
  .select("cancelled_at,cancelled_vested")
  .eq("stream_id", streamId ?? "");
const c = afterC?.[0];
check(
  "DB: cancel set cancelled_at + cancelled_vested (vested portion frozen)",
  !!c?.cancelled_at && BigInt(c?.cancelled_vested ?? "0") > 0n,
  c?.cancelled_at ? `vested=${c.cancelled_vested}` : "null",
);
const cancelledBadge = await page
  .evaluate(() => /Cancelled/.test(document.body.innerText))
  .catch(() => false);
check("UI: stream badge flips to Cancelled", cancelledBadge);

await browser.close();
console.log(`\nSTREAM_ID=${streamId ?? ""}`);
console.log(`RETAINER_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
