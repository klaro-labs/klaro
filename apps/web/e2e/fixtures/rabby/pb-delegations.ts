// Delegations (session keys) persistence UI E2E — proves the T1 honest-mode fix:
// the issue/revoke paths now persist to session_keys (0040) instead of vanishing
// in live mode, with honest "Circle enforcement pending" labels. No wallet.
//   VENDOR magic-link login -> /vendor/delegations -> issue a scoped session key
//   -> session_keys row persists (revoked_at NULL) -> Revoke -> revoked_at set,
//   drops out of the active list.
//
// Run from apps/web with the dev server on :3100:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-delegations.ts
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
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
let n = 0;
const log = (...a: unknown[]) => console.log(`[deleg ${++n}]`, ...a);
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures++;
};

const stamp = Date.now();
const keyLabel = `QA deleg ${stamp} — accounting bot`;
const delegate = "0x000000000000000000000000000000000000dEaD";

const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (mlErr || !ml.properties?.hashed_token) {
  console.error("login mint failed", mlErr?.message);
  process.exit(2);
}
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/delegations")}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const loginPage = await ctx.newPage();
await loginPage.goto(callback, { waitUntil: "domcontentloaded", timeout: 120000 });
await loginPage.waitForTimeout(2500);
await loginPage.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR:", e.message.slice(0, 160)));
await page.goto(`${BASE}/vendor/delegations`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
if (/\/signin/.test(page.url())) {
  console.error("session not established");
  await browser.close();
  process.exit(2);
}
const honest = await page
  .evaluate(() => {
    const t = document.body.innerText;
    return /Circle enforcement pending/i.test(t) && /not yet an enforced grant/i.test(t);
  })
  .catch(() => false);
check("UI: honest 'enforcement pending / not yet an enforced grant' labels", honest);

// ── issue session key ─────────────────────────────────────────────────
await page.locator('input[name="label"]').first().fill(keyLabel);
await page.locator('input[name="delegate"]').first().fill(delegate);
await page.locator('select[name="scope"]').first().selectOption("CASHOUT_REQUEST");
await page.locator('input[name="ttlHours"]').first().fill("48");
await page.getByRole("button", { name: /Issue session key/i }).first().click();
await page.waitForTimeout(2500);

const { data: rows } = await admin
  .from("session_keys")
  .select("id,delegate_address,scope,expires_at,revoked_at")
  .eq("label", keyLabel);
const row = rows?.[0];
log("db row:", row ? `scope=${row.scope} revoked=${row.revoked_at !== null}` : "(none)");
check(
  "DB: session_keys row persisted (CASHOUT_REQUEST, not revoked)",
  row?.scope === "CASHOUT_REQUEST" && row?.revoked_at === null && row?.delegate_address?.toLowerCase() === delegate.toLowerCase(),
);
const keyId = row?.id as string | undefined;

// ── reload: key shows in the active list ──────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const appears = await page.getByText(keyLabel, { exact: false }).first().isVisible().catch(() => false);
check("UI: issued key appears in the active list (persists)", appears);

// ── revoke ────────────────────────────────────────────────────────────
const revoke = page.getByRole("button", { name: /^Revoke$/i }).first();
if (await revoke.isVisible({ timeout: 6000 }).catch(() => false)) {
  await revoke.click().catch(() => {});
  await page.waitForTimeout(2500);
}
const goneUi = !(await page.getByText(keyLabel, { exact: false }).first().isVisible().catch(() => false));
check("UI: key removed from active list after revoke", goneUi);
const { data: after } = await admin.from("session_keys").select("revoked_at").eq("id", keyId ?? "");
check("DB: revoked_at set after revoke", !!after?.[0]?.revoked_at, after?.[0]?.revoked_at ? "set" : "null");

await browser.close();
console.log(`\nSESSION_KEY_ID=${keyId ?? ""}`);
console.log(`DELEGATIONS_E2E_OK=${failures === 0}`);
process.exit(failures === 0 ? 0 : 1);
