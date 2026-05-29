// Real-Rabby buyer PAY leg: drive PayWithUSDC end-to-end through the REAL public
// invoice page (/i/[id]) with the ACTUAL Rabby MV3 extension (buyer profile
// 0x2a369C). Live path: connect → add/switch Arc → Pay → EIP-712 acceptance
// sign + USDC approve + acceptAndPay (3 Rabby popups) → on-chain InvoicePaid →
// daemon screens+settles → AuditReceipt mints. No login — anonymous buyer.
//
// Usage (from apps/web):
//   RABBY_PASSWORD=... tsx e2e/fixtures/rabby/pb-pay-rabby.ts <publishedInvoiceId>
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbi } from "viem";
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
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const BASE = "http://localhost:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const INVOICE = process.argv[2];
if (!INVOICE) { console.error("usage: pb-pay-rabby.ts <invoiceId>"); process.exit(2); }
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`;
const USDC = (local.NEXT_PUBLIC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
const REC_DIR = path.resolve("../../internal/qa/recordings/2026-05-29/real-rabby-pay");
mkdirSync(REC_DIR, { recursive: true });
let n = 0; const log = (...a: unknown[]) => console.log(`[pay ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const buyer = (wallets.CUSTOMER_TEST_PRIVATE_KEY || "").toLowerCase();
const pub = createPublicClient({ chain: ARC, transport: http() });
const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const ERC20 = parseAbi(["function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// derive buyer address
const { privateKeyToAccount } = await import("viem/accounts");
const buyerAcct = privateKeyToAccount(wallets.CUSTOMER_TEST_PRIVATE_KEY as `0x${string}`);
const BUYER = buyerAcct.address;
log("buyer wallet:", BUYER);

const before = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE as `0x${string}`] });
log("before: on-chain status", Number(before[9]), "(1=CREATED payable) acceptedBy", before[5]);
const bal = await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [BUYER] }).catch(() => 0n);
log("buyer USDC:", (Number(bal) / 1e6).toFixed(4), "invoice amount:", (Number(before[2]) / 1e6).toFixed(4));

const RABBY_PASSWORD = process.env.RABBY_PASSWORD ?? "RabbyPass123!QA";
const { context, extId } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile-buyer"), shotsDir: REC_DIR });

// unlock buyer Rabby first + enable testnets (so connect popup is the approve,
// and Arc is addable) — same pattern as real-Rabby publish.
const rabbyHome = await context.newPage();
await rabbyHome.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
await rabbyHome.waitForTimeout(2000);
await unlockRabby(rabbyHome);
log("buyer rabby unlocked; enabling testnets…");
await enableRabbyTestnets(rabbyHome, extId).catch((e) => log("enableTestnets:", (e as Error).message.slice(0, 80)));
await rabbyHome.close().catch(() => {});

const page = await context.newPage();
const shot = async (l: string, p = page) => { try { await p.screenshot({ path: path.join(shots, `${l}.png`) }); } catch {} };

await page.goto(`${BASE}/i/${INVOICE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
log("on pay page:", page.url());
await shot("20-paypage");

async function handlePopup(label: string, known: Set<unknown>, timeoutMs = 60000) {
  const pop = await waitForRabbyPopup(context, extId, known as Set<never>, 18000).catch(() => null);
  if (!pop) { log(label, "no popup appeared"); return false; }
  await pop.waitForLoadState("domcontentloaded").catch(() => {});
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await pop.locator('button, input[type="password"]').first().isVisible({ timeout: 500 }).catch(() => false);
    if (ready) break;
    await pop.waitForTimeout(500);
  }
  await shot(label, pop);
  const pwd = pop.locator('input[type="password"]').first();
  if (await pwd.isVisible({ timeout: 1000 }).catch(() => false)) {
    log(label, "popup locked — unlocking");
    await pwd.fill(RABBY_PASSWORD).catch(() => {});
    await pop.keyboard.press("Enter").catch(() => {});
    await pop.waitForTimeout(1800).catch(() => {});
  }
  if (!pop.isClosed()) {
    await confirmRabbyPopup(pop, { timeoutMs, shotsDir: shots, label }).catch((e) => log(label, "confirm:", (e as Error).message));
  } else {
    log(label, "popup closed after unlock");
  }
  await page.waitForTimeout(1500).catch(() => {});
  return true;
}

// The pay page renders PayWithUSDC TWICE (mobile-first in DOM, then desktop).
// `.first()` is the hidden mobile copy — must click the VISIBLE one.
async function clickVisible(rx: RegExp, timeout = 6000): Promise<boolean> {
  const cands = page.getByRole("button", { name: rx });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const cnt = await cands.count();
    for (let i = 0; i < cnt; i++) {
      const b = cands.nth(i);
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); return true; }
    }
    await page.waitForTimeout(400);
  }
  return false;
}

// connect
{
  const k = new Set(context.pages());
  if (await clickVisible(/Connect wallet/i, 8000)) {
    log("connect clicked");
    await handlePopup("21-connect", k);
  } else {
    log("Connect button not visible — body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
  }
}
await page.waitForTimeout(1500);
await shot("22-after-connect");

// MV3: the Rabby approve response often doesn't propagate back to wagmi → the
// page stays on "Connect wallet". Rabby has now permitted the site, so a reload
// lets wagmi auto-connect via eth_accounts (proven pattern from pb-publish).
for (let attempt = 0; attempt < 3; attempt++) {
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (!/Connect wallet|Opening wallet/i.test(body)) { log("buyer connected ✓"); break; }
  log("not connected yet — reload to auto-connect (attempt", attempt + 1, ")");
  await page.reload({ waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (/Connect wallet/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""))) {
    const k = new Set(context.pages());
    if (await clickVisible(/Connect wallet/i, 5000)) { log("re-connect click"); await handlePopup("21b-connect", k); }
    await page.waitForTimeout(2500);
  }
}
await shot("22b-after-reconnect");

// switch / add Arc (buyer profile is fresh — first switch is the add-network dialog)
{
  const k = new Set(context.pages());
  if (await clickVisible(/Switch to Arc/i, 5000)) {
    log("switch/add Arc clicked");
    await handlePopup("23-switch", k, 60000);
    await page.waitForTimeout(1500);
    const k2 = new Set(context.pages());
    await handlePopup("23b-switch-confirm", k2, 30000);
  }
}
await shot("24-after-switch");

// click Pay (visible one)
const clicked = await clickVisible(/Pay invoice in USDC/i, 8000);
if (clicked) log("clicking Pay (visible)");
else log("Pay button NOT visible. body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 260));

// Drain the 3 pay requests: EIP-712 sign → approve → acceptAndPay. Rabby
// REUSES one notification.html popup (updating its content per request) and may
// also close+reopen it, so don't wait for a "new" popup — repeatedly confirm
// whatever popup is open until the on-chain payment lands. Arc's sub-second
// finality + confirmRabbyPopup's post-click wait let approve mine before
// acceptAndPay's gas estimation needs the allowance.
function findOpenPopup() {
  for (const p of context.pages()) {
    if (!p.isClosed() && p.url().includes(`${extId}/notification.html`)) return p;
  }
  return null;
}
let paid = false;
const payDeadline = Date.now() + 150_000;
let round = 0;
while (Date.now() < payDeadline && !paid) {
  const popup = findOpenPopup();
  if (popup) {
    round++;
    await shot(`25-pay-r${round}`, popup);
    await confirmRabbyPopup(popup, { timeoutMs: 35_000, shotsDir: shots, label: `pay-r${round}` }).catch((e) => log(`pay-r${round} confirm:`, (e as Error).message));
  } else {
    await page.waitForTimeout(2500); // wait for the next request to open a popup / tx to mine
  }
  const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE as `0x${string}`] }).catch(() => null);
  const allow = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [BUYER, ESCROW] }).catch(() => 0n);
  log(`round ${round}: popup=${popup ? "yes" : "no"} allowance=${(Number(allow) / 1e6).toFixed(4)} acceptedBy=${o ? o[5] : "?"}`);
  if (o && o[5].toLowerCase() === BUYER.toLowerCase()) { paid = true; log("PAID on-chain ✓ status", Number(o[9]), "acceptedBy", o[5]); break; }
  await page.waitForTimeout(1500);
}
await shot("26-after-pay");

// final on-chain wait (in case acceptAndPay mined a touch late)
if (!paid) {
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE as `0x${string}`] }).catch(() => null);
    if (o && o[5].toLowerCase() === BUYER.toLowerCase()) { paid = true; log("PAID on-chain ✓ (late) status", Number(o[9])); break; }
  }
}

// wait for the daemon to screen+settle and mint the receipt (event-sourced)
let dbStatus = "?", settled = false, receiptHash: string | null = null;
for (let i = 0; i < 40; i++) {
  const { data: row } = await admin.from("invoices").select("status,paid_tx_hash,settled_tx_hash,receipt_hash,accepted_by").eq("id", INVOICE).maybeSingle();
  dbStatus = row?.status ?? "?";
  receiptHash = row?.receipt_hash ?? null;
  if (row?.status === "SETTLED") { settled = true; log("daemon settled ✓ status=SETTLED receipt_hash=", receiptHash); break; }
  if (row?.status === "PAID") log(`daemon: PAID (waiting for screen+settle) i=${i}`);
  await new Promise((r) => setTimeout(r, 3000));
}
const { data: finalRow } = await admin.from("invoices").select("status,paid_tx_hash,settled_tx_hash,receipt_hash,accepted_by").eq("id", INVOICE).maybeSingle();
log("DB final:", JSON.stringify(finalRow));

const ocFinal = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE as `0x${string}`] }).catch(() => null);
log("ON-CHAIN final: status", ocFinal ? Number(ocFinal[9]) : "n/a", "(3=PAID 4=SETTLED) acceptedBy", ocFinal ? ocFinal[5] : "n/a");

const uiPaid = /paid|settl|receipt|thank|submitted/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
log("UI shows paid/receipt state:", uiPaid);
await context.close();
console.log("PAY_OK=" + (paid && (finalRow?.status === "PAID" || finalRow?.status === "SETTLED")));
console.log("SETTLE_OK=" + settled);
process.exit(0);
