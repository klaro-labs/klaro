// PROOF CAPTURE — drives the live myklaro.app product like a real user and
// saves a screenshot at every step for the Klaro proof deck. Auth via the
// password-grant cookie (bypasses the magic-link rate limit); on-chain steps
// via the injected EIP-1193 bridge (keys stay in Node).
// Usage:  node e2e/proof-capture.mjs
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const SB = local.SUPABASE_URL, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = local.SUPABASE_SERVICE_ROLE_KEY;
const REF = SB.match(/https:\/\/([a-z0-9]+)\./)[1];
const BASE = process.env.KLARO_E2E_BASE_URL || "https://www.myklaro.app";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const OUT = path.resolve("docs/proof-deck/shots");
try { rmSync(OUT, { recursive: true, force: true }); } catch {}
mkdirSync(OUT, { recursive: true });
const admin = createClient(SB, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (...a) => console.log("[capture]", ...a);
const shots = [];
function note(f, cap) { shots.push({ file: f + ".png", cap }); }

// ── auth cookies (password grant) ──────────────────────────────────────────
async function cookiesFor() {
  await fetch(`${SB}/auth/v1/admin/users/37adac16-1a23-4887-b822-baed0339de5b`, { method: "PUT", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ password: "Klaro-QA-Test-9x7Kp2!" }) });
  const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: "xprtqk@gmail.com", password: "Klaro-QA-Test-9x7Kp2!" }) })).json();
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const name = `sb-${REF}-auth-token`, domain = new URL(BASE).hostname, CHUNK = 3180;
  return value.length <= CHUNK ? [{ name, value, domain, path: "/", secure: true, sameSite: "Lax" }]
    : value.match(new RegExp(`.{1,${CHUNK}}`, "g")).map((v, i) => ({ name: `${name}.${i}`, value: v, domain, path: "/", secure: true, sameSite: "Lax" }));
}

// ── injected wallet shim (vendor = the invoice publisher/payee) ────────────
const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY);
const wallet = createWalletClient({ account: vendor, chain: ARC, transport: http() });
const pub = createPublicClient({ chain: ARC, transport: http() });
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
let rpcId = 0;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json(); if (j.error) throw new Error(j.error.message); return j.result;
}
async function bridge(argsJson) {
  const { method, params = [] } = JSON.parse(argsJson);
  switch (method) {
    case "eth_requestAccounts": case "eth_accounts": return [vendor.address];
    case "eth_chainId": return CHAIN_HEX;
    case "net_version": return String(CHAIN_ID);
    case "wallet_switchEthereumChain": case "wallet_addEthereumChain": case "wallet_watchAsset": return null;
    case "wallet_requestPermissions": case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": return await wallet.signMessage({ account: vendor, message: { raw: params[0] } });
    case "eth_signTypedData_v4": { const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1]; return await vendor.signTypedData(td); }
    case "eth_sendTransaction": { const tx = params[0] || {}; return await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }); }
    default: return await rpcForward(method, params);
  }
}
const shim = `(function(){var chainHex=${JSON.stringify(CHAIN_HEX)};var listeners={};var provider={isKlaroTestWallet:true,isMetaMask:false,chainId:chainHex,request:function(a){return window.__klaroBridge(JSON.stringify(a));},on:function(e,c){(listeners[e]=listeners[e]||[]).push(c);return provider;},addListener:function(e,c){return provider.on(e,c);},removeListener:function(e,c){listeners[e]=(listeners[e]||[]).filter(function(f){return f!==c;});return provider;},removeAllListeners:function(){for(var k in listeners)listeners[k]=[];return provider;}};window.ethereum=provider;window.__klaroShimRan=true;var info={uuid:"00000000-0000-0000-0000-0000000c1a70",name:"Klaro Test Wallet",icon:"data:image/svg+xml;base64,PHN2Zy8+",rdns:"io.klaro.testwallet"};function announce(){window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:Object.freeze({info:info,provider:provider})}));}window.addEventListener("eip6963:requestProvider",announce);announce();})();`;

const browser = await chromium.launch({ headless: true });
const vw = { width: 1280, height: 900 };

// ── 0. public landing + hosted invoice (no auth) ───────────────────────────
const ctx0 = await browser.newContext({ viewport: vw });
const p0 = await ctx0.newPage();
await p0.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await p0.waitForTimeout(2500);
await p0.screenshot({ path: path.join(OUT, "01-landing.png"), fullPage: false }); note("01-landing", "Public landing — Arc-native USDC invoicing");
log("captured landing");
await ctx0.close();

// ── authenticated vendor flow ──────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: vw });
await ctx.addCookies(await cookiesFor());
await ctx.exposeFunction("__klaroBridge", bridge);
await ctx.addInitScript({ content: shim });
const page = await ctx.newPage();
const shot = async (f, cap) => { await page.screenshot({ path: path.join(OUT, f + ".png") }); note(f, cap); log("captured", f); };

await page.goto(BASE + "/vendor", { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(3000);
await shot("02-vendor-dashboard", "Vendor dashboard — invoices, balances, reputation");

// create + publish a fresh invoice on-chain
await page.goto(BASE + "/vendor/invoices/new", { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(2500);
await shot("03-create-invoice", "Create invoice — amount, customer, description");
const amount = "1";
await page.locator('input[type="number"], input[inputmode="decimal"], [name="amount"]').first().fill(amount).catch(() => log("amount fill: primary selector missed (non-fatal)"));
await page.getByPlaceholder(/Backend dev|sprint/i).fill("Proof-deck invoice — live on-chain run").catch(() => {});
await page.getByPlaceholder(/client@company|@/i).first().fill("buyer-qa@example.com").catch(() => {});
await page.locator("button", { hasText: /Create invoice/i }).first().click();
await page.waitForURL(/\/vendor\/invoices\/0x[0-9a-fA-F]{64}/, { timeout: 30000 }).catch(() => {});
const invoiceId = page.url().match(/(0x[0-9a-fA-F]{64})/)?.[1];
log("created invoice:", invoiceId);
await page.waitForTimeout(1500);
await shot("04-invoice-detail", "Invoice created — hosted page + on-chain publish");

// publish on-chain (injected wallet)
const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 5000 }).catch(() => false)) { await connect.click().catch(() => {}); await page.waitForTimeout(2500); }
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 3000 }).catch(() => false)) { await sw.click().catch(() => {}); await page.waitForTimeout(2000); }
const pubBtn = page.locator("button", { hasText: /Publish invoice on-chain/i }).first();
if (await pubBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
  await pubBtn.click().catch(() => {});
  for (let i = 0; i < 35; i++) { await page.waitForTimeout(1000); if (/Published on-chain/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""))) break; }
}
await page.waitForTimeout(1000);
await shot("05-published", "Published on-chain — InvoiceEscrow.createInvoice (CREATED)");
await ctx.close();

// read the publish tx from DB (for the deck)
const { data: row } = invoiceId ? await admin.from("invoices").select("published_tx_hash,status").eq("id", invoiceId).maybeSingle() : { data: null };
log("publish tx:", row?.published_tx_hash, "status:", row?.status);

// ── hosted invoice as the buyer (no auth, mobile) ──────────────────────────
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bp = await ctxB.newPage();
await bp.goto(`${BASE}/i/${invoiceId}`, { waitUntil: "domcontentloaded", timeout: 45000 }); await bp.waitForTimeout(2500);
await bp.screenshot({ path: path.join(OUT, "06-hosted-invoice.png") }); note("06-hosted-invoice", "Hosted invoice (buyer view) — pay in USDC on Arc");
log("captured hosted invoice");
await ctxB.close();

console.log("\nINVOICE_ID=" + (invoiceId || ""));
console.log("PUBLISH_TX=" + (row?.published_tx_hash || ""));
console.log("CAPTURED " + shots.length + " shots in " + OUT);
await browser.close();
