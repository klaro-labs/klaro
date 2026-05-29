// P-B publish: login -> open an existing CREATED+unpublished invoice ->
// connect Rabby + sign createInvoice -> verify on-chain. Targets a given id
// (default: the UI-created 0xeedc...). Warm routes = fast.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { launchRabby, unlockRabby, enableRabbyTestnets, waitForRabbyPopup, confirmRabbyPopup } from "./rabby-driver.js";

function env(file: string) {
  const o: Record<string, string> = {};
  for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("="); if (i < 0) continue;
    o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return o;
}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3100";
const INVOICE = process.argv[2] || "0xeedc734617de5e69b50f72ad86da4201ca7763f6cd0a4061fd9fd8edca5d0814";
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
// Kept screen recording of the real-Rabby publish user flow.
const REC_DIR = path.resolve("../../internal/qa/recordings/2026-05-29/real-rabby-publish");
mkdirSync(REC_DIR, { recursive: true });
let n = 0; const log = (...a: unknown[]) => console.log(`[pub ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
if (lerr || !link.properties?.hashed_token) { console.error("login mint failed", lerr?.message); process.exit(2); }
const callback = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/" + INVOICE)}`;

const RABBY_PASSWORD = process.env.RABBY_PASSWORD ?? "RabbyPass123!QA";
const { context, extId } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile"), shotsDir: REC_DIR });

// fhenix pattern: UNLOCK Rabby first (own tab) + enable testnets, so the dApp
// connect popup is the connect-APPROVE (not the lock screen) and Arc is
// selectable. Connect-before-unlock hung at "Opening wallet…".
const rabbyHome = await context.newPage();
await rabbyHome.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
await rabbyHome.waitForTimeout(2000);
await unlockRabby(rabbyHome);
log("rabby unlocked; enabling testnets…");
await enableRabbyTestnets(rabbyHome, extId).catch((e) => log("enableTestnets:", (e as Error).message.slice(0, 80)));
await rabbyHome.close().catch(() => {});

const page = await context.newPage();
const shot = async (l: string, p = page) => { try { await p.screenshot({ path: path.join(shots, `${l}.png`) }); } catch {} };

await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
log("on invoice page:", page.url());
await shot("10-detail");

async function handlePopup(label: string, known: Set<unknown>, timeoutMs = 60000) {
  const pop = await waitForRabbyPopup(context, extId, known as Set<never>, 20000).catch(() => null);
  if (!pop) { log(label, "no popup appeared"); return; }
  await pop.waitForLoadState("domcontentloaded").catch(() => {});
  // wait past Rabby's loading spinner until real content (a button or pwd field) renders
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await pop.locator('button, input[type="password"]').first().isVisible({ timeout: 500 }).catch(() => false);
    if (ready) break;
    await pop.waitForTimeout(500);
  }
  await shot(label, pop);
  // unlock if this popup is the locked-vault screen. The popup may close
  // immediately after unlock (unlock can auto-approve a pending request) —
  // guard every subsequent op against the popup being gone.
  const pwd = pop.locator('input[type="password"]').first();
  if (await pwd.isVisible({ timeout: 1000 }).catch(() => false)) {
    log(label, "popup locked — entering password");
    await pwd.fill(RABBY_PASSWORD).catch(() => {});
    await pop.keyboard.press("Enter").catch(() => {});
    await pop.waitForTimeout(1800).catch(() => {});
    if (!pop.isClosed()) await shot(label + "-unlocked", pop);
  }
  if (!pop.isClosed()) {
    await confirmRabbyPopup(pop, { timeoutMs }).catch((e) => log(label, "confirm:", (e as Error).message));
  } else {
    log(label, "popup closed after unlock (request likely approved)");
  }
  await page.waitForTimeout(2500).catch(() => {});
}

// connect
const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("connect");
  const k = new Set(context.pages());
  await connect.click();
  await handlePopup("11-connect", k);
}
await shot("12-after-connect");
// MV3 fix: wagmi often hangs at "Opening wallet…" after the Rabby approve
// (the eth_requestAccounts response doesn't propagate back). Rabby is now
// unlocked + the site is permitted, so reload → injected connector
// auto-connects via eth_accounts (no hanging request).
if (/Opening wallet/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""))) {
  log("stuck 'Opening wallet…' — reloading to let injected connector auto-connect");
  await page.reload({ waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  log("after reload:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 160));
}
// Rabby is now UNLOCKED but the original connect-request popup was lost on the
// unlock. Re-trigger connect — this popup is the connect-APPROVE (no lock
// screen), so confirmRabbyPopup can click the approve button cleanly.
for (let attempt = 0; attempt < 2; attempt++) {
  const c2 = page.locator("button", { hasText: /Connect wallet/i }).first();
  if (!(await c2.isVisible({ timeout: 4000 }).catch(() => false))) break;
  log("re-connect attempt", attempt + 1, "(Rabby unlocked → connect-approve popup)");
  const k2 = new Set(context.pages());
  await c2.click();
  await handlePopup("11b-connect-approve", k2);
  await page.waitForTimeout(2500);
  if (!/Connect wallet|Opening wallet/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""))) { log("connected ✓"); break; }
}
// switch chain — first switch to Arc shows "Add Custom Network to Rabby"
// (chain 5042002 not yet in the wallet). Clicking Add may then trigger a
// second "switch to it" popup, so drain a follow-up.
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 5000 }).catch(() => false)) {
  log("switch chain");
  const k = new Set(context.pages());
  await sw.click();
  await handlePopup("13-switch", k, 60000);
  await page.waitForTimeout(1500);
  // follow-up: Rabby may ask to switch to the just-added chain
  const k2 = new Set(context.pages());
  await handlePopup("13b-switch-confirm", k2, 30000);
}
await shot("14-after-switch");
log("after-switch state:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 160));
// publish
const pubBtn = page.locator("button", { hasText: /Publish invoice on-chain/i }).first();
if (await pubBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("publish");
  const k = new Set(context.pages());
  await pubBtn.click();
  await handlePopup("15-sign", k, 60000);
  // The createInvoice tx is signed + broadcast. The client records the hash
  // (phase "recording" → "done"). Give the tx time to mine, then reload — the
  // invoice detail page reconciles published_tx_hash against on-chain truth on
  // load, so even if the client record step didn't land the vendor sees
  // "Published on-chain" (resilience fix). Poll the reloaded page for done.
  const recDeadline = Date.now() + 90_000;
  let done = false;
  while (Date.now() < recDeadline && !done) {
    await page.waitForTimeout(4000);
    await page.reload({ waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    const body = await page.evaluate(() => document.body.innerText).catch(() => "");
    if (/Published on-chain/i.test(body)) { log("UI shows Published on-chain ✓ (after reconcile)"); done = true; break; }
    if (/cancelled the signature|Publish failed/i.test(body)) { log("publish error in UI:", body.replace(/\s+/g, " ").slice(0, 160)); break; }
  }
} else {
  log("Publish button not visible — state:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
}
await shot("16-final");
log("published-on-chain shown:", /Published on-chain/i.test(await page.evaluate(() => document.body.innerText).catch(() => "")));

// verify
const { createPublicClient, http, parseAbi } = await import("viem");
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"] } } };
const pub = createPublicClient({ chain: ARC, transport: http() });
const ESC = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const oc = await pub.readContract({ address: local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`, abi: ESC, functionName: "invoices", args: [INVOICE as `0x${string}`] }).catch(() => null);
log("ON-CHAIN status:", oc ? Number(oc[9]) : "n/a", "(1=CREATED) vendor:", oc ? oc[0] : "n/a");
const { data: row } = await admin.from("invoices").select("published_tx_hash").eq("id", INVOICE).maybeSingle();
log("DB published_tx_hash:", row?.published_tx_hash ?? "null");
console.log("PUBLISH_OK=" + (!!oc && Number(oc[9]) === 1 && !!row?.published_tx_hash));
await context.close();
process.exit(0);
