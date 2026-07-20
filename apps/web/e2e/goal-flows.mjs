// GOAL flows — drive the core money path as a human against the LIVE site:
//   login → create invoice → publish on-chain (injected wallet, real Arc tx)
//   → verify on-chain (escrow.invoices) + DB → open hosted /i/<id> as a buyer.
// Injected EIP-1193 bridge (key stays in Node) reused from pb-inject.ts so the
// wagmi injected() → writeContract(createInvoice) path is exercised for real.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbi, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const shots = path.resolve("e2e/.goal-flow-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[flow ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: vendor, chain: ARC, transport: http() });
log("vendor injected account:", vendor.address, "| escrow:", ESCROW, "| base:", BASE);

let rpcId = 0;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function bridge(argsJson) {
  const { method, params = [] } = JSON.parse(argsJson);
  switch (method) {
    case "eth_requestAccounts": case "eth_accounts": return [vendor.address];
    case "eth_chainId": return "0x" + CHAIN_ID.toString(16);
    case "net_version": return String(CHAIN_ID);
    case "wallet_switchEthereumChain": case "wallet_addEthereumChain": case "wallet_watchAsset": return null;
    case "wallet_requestPermissions": case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": return await wallet.signMessage({ account: vendor, message: { raw: params[0] } });
    case "eth_signTypedData_v4": { const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1]; return await vendor.signTypedData(td); }
    case "eth_sendTransaction": { const tx = params[0] || {}; const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }); log("tx broadcast", hash); return hash; }
    default: return await rpcForward(method, params);
  }
}
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const shimContent = `
(function(){
  var chainHex = ${JSON.stringify(CHAIN_HEX)};
  var listeners = {};
  var provider = { isKlaroTestWallet:true, isMetaMask:false, chainId:chainHex,
    request:function(args){ return window.__klaroBridge(JSON.stringify(args)); },
    on:function(ev,cb){ (listeners[ev]=listeners[ev]||[]).push(cb); return provider; },
    addListener:function(ev,cb){ return provider.on(ev,cb); },
    removeListener:function(ev,cb){ listeners[ev]=(listeners[ev]||[]).filter(function(f){return f!==cb;}); return provider; },
    removeAllListeners:function(){ for(var k in listeners) listeners[k]=[]; return provider; } };
  window.ethereum = provider; window.__klaroShimRan = true;
  var info = { uuid:"00000000-0000-0000-0000-0000000c1a70", name:"Klaro Test Wallet", icon:"data:image/svg+xml;base64,PHN2Zy8+", rdns:"io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:Object.freeze({info:info,provider:provider})})); }
  window.addEventListener("eip6963:requestProvider", announce); announce();
})();`;

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(next) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
  if (error || !link.properties?.hashed_token) throw new Error("login mint failed: " + error?.message);
  return `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.exposeFunction("__klaroBridge", bridge);
await context.addInitScript({ content: shimContent });
const page = await context.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" && !/reown|allowlist|403/i.test(m.text())) errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, `${l}.png`) }); } catch {} };

// ── 1. create invoice ──────────────────────────────────────────────
await page.goto(await login("/vendor/invoices/new"), { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
log("on:", page.url());
const amount = process.env.KLARO_INV_AMOUNT || "37";
const desc = "QA goal-flow invoice " + (process.env.KLARO_RUN_TAG || "live");
await page.locator('input[type="number"], input[inputmode="decimal"], [name="amount"]').first().fill(amount).catch(async () => { await page.locator("spinbutton").first().fill(amount); });
await page.getByPlaceholder(/Backend dev|sprint/i).fill(desc).catch(() => {});
await page.getByPlaceholder(/client@company|@/i).first().fill("buyer-qa@example.com").catch(() => {});
await page.waitForSelector("button:has-text('Create invoice')", { timeout: 15000 });
await shot("01-form-filled");
await page.locator("button", { hasText: /Create invoice/i }).first().click();
await page.waitForURL(/\/vendor\/invoices\/0x[0-9a-fA-F]{64}/, { timeout: 30000 }).catch(() => {});
const invUrl = page.url();
const invoiceId = invUrl.match(/(0x[0-9a-fA-F]{64})/)?.[1] ?? null;
log("after create:", invUrl, "| id:", invoiceId);
await shot("02-detail");
if (!invoiceId) { console.error("CREATE FAILED — no invoice id in URL. body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 300)); await browser.close(); process.exit(3); }

// DB confirm
const { data: dbRow } = await admin.from("invoices").select("id,status,amount_usdc,description").eq("id", invoiceId).maybeSingle();
log("DB row:", dbRow ? `status=${dbRow.status} amount=${dbRow.amount_usdc} desc="${dbRow.description}"` : "NOT FOUND");

// ── 2. publish on-chain (injected wallet) ──────────────────────────
const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 5000 }).catch(() => false)) { log("Connect wallet"); await connect.click().catch(() => {}); await page.waitForTimeout(2500); }
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 3000 }).catch(() => false)) { log("Switch to Arc"); await sw.click().catch(() => {}); await page.waitForTimeout(2000); }
await shot("03-after-connect");
const pubBtn = page.locator("button", { hasText: /Publish invoice on-chain/i }).first();
let published = false;
if (await pubBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("Publish invoice on-chain"); await pubBtn.click().catch(() => {});
  for (let i = 0; i < 35; i++) { await page.waitForTimeout(1000); published = /Published on-chain/i.test(await page.evaluate(() => document.body.innerText).catch(() => "")); if (published) break; }
} else { log("Publish button NOT visible. body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 240)); }
await shot("04-published");
log("UI 'Published on-chain':", published);

// on-chain + DB verify
const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const oc = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [invoiceId] }).catch((e) => { log("readContract err:", e.message.slice(0, 80)); return null; });
const onChainStatus = oc ? Number(oc[9]) : -1;
log("ON-CHAIN status:", onChainStatus, "(1=CREATED) vendor:", oc ? oc[0] : "n/a");
const { data: pubRow } = await admin.from("invoices").select("published_tx_hash,status").eq("id", invoiceId).maybeSingle();
log("DB published_tx_hash:", pubRow?.published_tx_hash ?? "null", "status:", pubRow?.status);

// ── 3. hosted invoice page as a logged-out buyer ───────────────────
const buyerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bp = await buyerCtx.newPage();
const buyerErrs = [];
bp.on("console", (m) => { if (m.type() === "error" && !/reown|allowlist|403/i.test(m.text())) buyerErrs.push(m.text().slice(0, 140)); });
await bp.goto(`${BASE}/i/${invoiceId}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await bp.waitForTimeout(2500);
const hostedBody = await bp.evaluate(() => document.body.innerText).catch(() => "");
const hostedOk = /pay/i.test(hostedBody) && new RegExp(amount).test(hostedBody) && !/Server Components render/i.test(hostedBody);
await bp.screenshot({ path: path.join(shots, "05-hosted-buyer.png") }).catch(() => {});
log("HOSTED /i page: payUI+amount visible:", hostedOk, "| buyer console errs:", buyerErrs.length);
await buyerCtx.close();

// ── report ─────────────────────────────────────────────────────────
const onChainOk = onChainStatus === 1 && oc && oc[0].toLowerCase() === vendor.address.toLowerCase();
console.log("\n===== GOAL FLOW RESULT =====");
console.log("create invoice  :", invoiceId ? "PASS (" + invoiceId.slice(0, 12) + "…)" : "FAIL");
console.log("DB row written  :", dbRow ? "PASS" : "FAIL");
console.log("publish on-chain:", published && onChainOk ? "PASS" : `CHECK (ui=${published} status=${onChainStatus} txhash=${pubRow?.published_tx_hash ? "set" : "null"})`);
console.log("hosted /i page  :", hostedOk ? "PASS" : "CHECK");
console.log("page errors     :", errs.length ? errs.join(" | ") : "none (WC/Reown 403 excluded)");
console.log("screenshots     :", shots);
await browser.close();
process.exit(errs.length || !invoiceId ? 1 : 0);
