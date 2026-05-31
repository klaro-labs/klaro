// Cashout fiat-leg honesty E2E — proves the Task-3 fix: in on-chain-LIVE mode
// (session.simulated=false) the cashout detail page now says the local-currency
// (fiat) payout leg is simulated / partner-pending — the on-chain USDC lock +
// release are real, but no licensed fiat partner exists on testnet, so the
// "payout proof" must not read as a real bank payout. No wallet needed.
//   Provision a PROOF_SUBMITTED order for the test vendor (service-role) ->
//   VENDOR magic-link login -> /vendor/cashout/<id> -> assert the
//   partner-pending banner + the "simulated reference — no real payout" UTR note.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-cashout-fiat.ts
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
const VENDOR_WALLET = "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677";
const ORDER_ID =
  "0x00000000000000000000000000000000000000000000000000000000cab00f01";
let n = 0;
const log = (...a: unknown[]) => console.log(`[cashout ${++n}]`, ...a);
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

// ── provision a PROOF_SUBMITTED order for the vendor (idempotent) ──────
await admin.from("cashout_orders").delete().eq("id", ORDER_ID);
const nowIso = new Date().toISOString();
const { error: insErr } = await admin.from("cashout_orders").insert({
  id: ORDER_ID,
  vendor_id: VENDOR_ID,
  vendor_wallet: VENDOR_WALLET,
  usdc_amount: 2_400_000_000,
  payout_minor: 19_920_000,
  currency: "INR",
  klaro_fee_usdc: 12_000_000,
  lp_spread_usdc: 6_000_000,
  quote_rate: 83,
  quote_hash:
    "0x1111111111111111111111111111111111111111111111111111111111111111",
  status: "PROOF_SUBMITTED",
  lp_id: null,
  lp_name: null,
  proof_hash:
    "0x2222222222222222222222222222222222222222222222222222222222222222",
  utr_reference: "UTRQA1234567",
  requested_at: nowIso,
  quote_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  updated_at: nowIso,
});
if (insErr) {
  console.error("cashout_orders provision failed", insErr.message);
  process.exit(2);
}
log("provisioned PROOF_SUBMITTED order", ORDER_ID.slice(0, 14));

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/cashout/" + ORDER_ID)}`;

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
await page.goto(`${BASE}/vendor/cashout/${ORDER_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
if (/\/signin/.test(page.url())) {
  console.error("session not established");
  await browser.close();
  await admin.from("cashout_orders").delete().eq("id", ORDER_ID);
  process.exit(2);
}

const body = await page.evaluate(() => document.body.innerText).catch(() => "");
// sanity: the order actually rendered (not notFound) — its UTR shows.
check("UI: order detail rendered (UTR shown)", /UTRQA1234567/.test(body));
check(
  "UI: fiat partner-pending banner shown in live mode",
  /Local-currency payout is partner-pending/i.test(body) &&
    /no licensed fiat partner on testnet|fiat partner is mainnet-only/i.test(
      body,
    ),
);
check(
  "UI: UTR labeled as simulated (no real payout) in live mode",
  /simulated reference — no real payout sent/i.test(body),
);
// the on-chain framing stays honest (escrow real, not a bank)
check(
  "UI: on-chain lock framed as real (USDC lock/release real)",
  /USDC lock and release on Arc are real/i.test(body),
);

await browser.close();
await admin.from("cashout_orders").delete().eq("id", ORDER_ID);
log("cleaned up provisioned order");
console.log(`\nCASHOUT_FIAT_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
