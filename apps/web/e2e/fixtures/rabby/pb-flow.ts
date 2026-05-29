// P-B: full vendor publish flow as a human. login -> create invoice ->
// publish on-chain (Rabby connect + sign createInvoice) -> verify on-chain.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  launchRabby,
  unlockRabby,
  waitForRabbyPopup,
  confirmRabbyPopup,
} from "./rabby-driver.js";

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
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0;
const log = (...a: unknown[]) => console.log(`[pb ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "xprtqk@gmail.com",
});
if (linkErr || !link.properties?.hashed_token) { console.error("login mint failed", linkErr?.message); process.exit(2); }
const callback = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/new")}`;

const { context, extId } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile") });
const shot = async (label: string, p = context.pages()[0]) => { try { await p.screenshot({ path: path.join(shots, `${label}.png`) }); } catch {} };

const page = await context.newPage();
await unlockRabby(page).catch(() => {});
await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
log("logged in, url:", page.url());

// ── create invoice ───────────────────────────────────────────────
await page.fill('input[type="number"]', "50").catch(() => {});
await page.fill('input[type="text"]', "QA adversarial test invoice").catch(() => {});
await page.fill('input[type="email"]', "buyer-qa@example.com").catch(() => {});
await shot("01-form");
await page.locator("button", { hasText: /Create invoice/i }).first().click();
await page.waitForURL(/\/vendor\/invoices\/0x[0-9a-fA-F]+/, { timeout: 25000 }).catch(() => {});
const invUrl = page.url();
const invoiceId = invUrl.match(/(0x[0-9a-fA-F]{64})/)?.[1] ?? null;
log("after create, url:", invUrl, "invoiceId:", invoiceId);
await shot("02-detail");
if (!invoiceId) { console.error("invoice not created / no id in URL"); await context.close(); process.exit(3); }

// ── publish on-chain: connect Rabby ───────────────────────────────
const known = new Set(context.pages());
const connectBtn = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  log("clicking Connect wallet");
  await connectBtn.click();
  const pop = await waitForRabbyPopup(context, extId, known, 15000).catch(() => null);
  if (pop) { await unlockRabby(pop).catch(() => {}); await shot("03-connect-popup", pop); await confirmRabbyPopup(pop, { timeoutMs: 30000 }).catch((e) => log("connect confirm:", e.message)); }
  await page.waitForTimeout(2500);
}
await shot("04-after-connect");

// switch to Arc if prompted
const switchBtn = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await switchBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
  log("switching chain to Arc");
  const known2 = new Set(context.pages());
  await switchBtn.click();
  const pop = await waitForRabbyPopup(context, extId, known2, 15000).catch(() => null);
  if (pop) { await unlockRabby(pop).catch(() => {}); await shot("05-switch-popup", pop); await confirmRabbyPopup(pop, { timeoutMs: 30000 }).catch((e) => log("switch confirm:", e.message)); }
  await page.waitForTimeout(2500);
}
await shot("06-after-switch");

// ── publish ───────────────────────────────────────────────────────
const publishBtn = page.locator("button", { hasText: /Publish invoice on-chain/i }).first();
if (await publishBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  log("clicking Publish invoice on-chain");
  const known3 = new Set(context.pages());
  await publishBtn.click();
  const pop = await waitForRabbyPopup(context, extId, known3, 15000).catch(() => null);
  if (pop) { await unlockRabby(pop).catch(() => {}); await shot("07-sign-popup", pop); await confirmRabbyPopup(pop, { timeoutMs: 45000 }).catch((e) => log("sign confirm:", e.message)); }
  await page.waitForTimeout(4000);
} else {
  log("Publish button NOT visible — connect/switch may have failed");
}
await shot("08-after-publish");

const pageText = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
log("published-on-chain shown:", /Published on-chain/i.test(pageText));

// ── verify on-chain + DB ──────────────────────────────────────────
const { createPublicClient, http, parseAbi } = await import("viem");
const ARC = { id: 5_042_002, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"] } } };
const pub = createPublicClient({ chain: ARC, transport: http() });
const ESC = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const oc = await pub.readContract({ address: local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`, abi: ESC, functionName: "invoices", args: [invoiceId as `0x${string}`] }).catch((e) => { log("onchain read err", e.shortMessage || e.message); return null; });
log("ON-CHAIN status:", oc ? oc[9] : "n/a", "(1=CREATED) vendor:", oc ? oc[0] : "n/a");

const { data: row } = await admin.from("invoices").select("status, published_tx_hash").eq("id", invoiceId).maybeSingle();
log("DB published_tx_hash:", row?.published_tx_hash ?? "null", "status:", row?.status);

console.log("INVOICE_ID=" + invoiceId);
console.log("PUBLISHED_ONCHAIN=" + (oc && Number(oc[9]) === 1));
await context.close();
process.exit(0);
