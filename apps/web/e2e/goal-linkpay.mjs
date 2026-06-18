// GOAL loop — buyer pays a Klaro Link (/pay/<slug>) end to end with the injected
// buyer wallet. Exercises the unique materialize-on-pay action
// (getOrCreateInvoiceForLink → publish backing invoice) then the normal
// sign → approve → acceptAndPay. Watches for 500/digest on the materialize.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
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
const SLUG = process.argv[2] || "wVKqNzRc";
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const shots = path.resolve("e2e/.goal-action-shots");
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[lp ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const buyer = privateKeyToAccount(wallets.CUSTOMER_TEST_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: buyer, chain: ARC, transport: http() });
log("buyer:", buyer.address, "| slug:", SLUG);

let rpcId = 0, nextNonce = null;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
}
async function bridge(argsJson) {
  const { method, params = [] } = JSON.parse(argsJson);
  switch (method) {
    case "eth_requestAccounts": case "eth_accounts": return [buyer.address];
    case "eth_chainId": return "0x" + CHAIN_ID.toString(16);
    case "net_version": return String(CHAIN_ID);
    case "wallet_switchEthereumChain": case "wallet_addEthereumChain": case "wallet_watchAsset": return null;
    case "wallet_requestPermissions": case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": return await wallet.signMessage({ account: buyer, message: { raw: params[0] } });
    case "eth_signTypedData_v4": {
      const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const types = { ...td.types }; delete types.EIP712Domain;
      const domain = { ...td.domain }; if (domain.chainId != null) domain.chainId = Number(domain.chainId);
      log("sign typed data:", td.primaryType);
      return await buyer.signTypedData({ domain, types, primaryType: td.primaryType, message: td.message });
    }
    case "eth_sendTransaction": {
      const tx = params[0] || {};
      if (nextNonce === null) nextNonce = await pub.getTransactionCount({ address: buyer.address, blockTag: "pending" });
      const nonce = nextNonce++;
      const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce, gas: 1_500_000n });
      log("tx broadcast", hash, "nonce", nonce); return hash;
    }
    default: return await rpcForward(method, params);
  }
}
const shimContent = `
(function(){ var chainHex = "0x${CHAIN_ID.toString(16)}"; var listeners = {};
  var provider = { isKlaroTestWallet:true, isMetaMask:false, chainId:chainHex,
    request:function(a){ return window.__klaroBridge(JSON.stringify(a)); },
    on:function(e,c){ (listeners[e]=listeners[e]||[]).push(c); return provider; },
    addListener:function(e,c){ return provider.on(e,c); },
    removeListener:function(e,c){ listeners[e]=(listeners[e]||[]).filter(function(f){return f!==c;}); return provider; },
    removeAllListeners:function(){ for(var k in listeners) listeners[k]=[]; return provider; } };
  window.ethereum = provider;
  var info = { uuid:"00000000-0000-0000-0000-0000000c1a70", name:"Klaro Test Wallet", icon:"data:image/svg+xml;base64,PHN2Zy8+", rdns:"io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:Object.freeze({info:info,provider:provider})})); }
  window.addEventListener("eip6963:requestProvider", announce); announce();
})();`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.exposeFunction("__klaroBridge", bridge);
await ctx.addInitScript({ content: shimContent });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !/reown|allowlist|403|already initialized/i.test(t)) errs.push(t.slice(0, 140)); });
page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 140)));
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png") }); } catch {} };
const digestOn = async () => /Server Components render|server-side exception/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));

await page.goto(`${BASE}/pay/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
log("on:", page.url());
const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 6000 }).catch(() => false)) { await connect.click().catch(() => {}); await page.waitForTimeout(2500); }
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 2500 }).catch(() => false)) { await sw.click().catch(() => {}); await page.waitForTimeout(1500); }
await shot("L1-link-connected");
const cont = page.locator("button", { hasText: /Continue to payment/i }).first();
let materializeDigest = false;
if (await cont.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("clicking Continue to payment (materialize)");
  await cont.click().catch(() => {});
  await page.waitForTimeout(6000);
  materializeDigest = await digestOn();
} else log("Continue button not visible. buttons:", (await page.locator("button").allInnerTexts().catch(() => [])).join(" | "));
await shot("L2-after-materialize");
const pay = page.getByRole("button", { name: /Pay invoice in USDC/i });
const cnt = await pay.count();
for (let i = 0; i < cnt; i++) { const bn = pay.nth(i); if (await bn.isVisible().catch(() => false)) { log("clicking Pay"); await bn.click().catch(() => {}); break; } }
await page.waitForTimeout(4000);
const bodyTxt = await page.evaluate(() => document.body.innerText).catch(() => "");
const invId = bodyTxt.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null;
let paidStatus = -1;
if (invId) {
  const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(1500); const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [invId] }).catch(() => null); if (o && o[5].toLowerCase() === buyer.address.toLowerCase()) { paidStatus = Number(o[9]); break; } }
}
await shot("L3-link-paid");
const uiPaid = /paid|settl|receipt|thank/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
console.log("\n===== LINK BUYER PAY =====");
console.log("materialize digest/500 :", materializeDigest ? "YES (BUG)" : "no");
console.log("backing invoice id      :", invId ? invId.slice(0, 14) + "…" : "not found on page");
console.log("on-chain paid status    :", paidStatus, "(buyer accepted:", paidStatus >= 0 ? "yes" : "no/unknown", ")");
console.log("UI paid/receipt state   :", uiPaid);
console.log("page errors             :", errs.length ? errs.join(" | ") : "none");
await browser.close();
