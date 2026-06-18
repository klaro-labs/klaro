// GOAL wallet-gated live actions on LIVE — vendor (LP_TEST) injected wallet:
//   A. Webhook add with a reachable URL (SSRF guard passes)
//   B. Payment-link create (Connect → sign EIP-712 authorization → create)
//   C. Cashout submit (Connect → requestAndLock on-chain → record)
// Verifies each in the DB and cleans up test rows.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http } from "viem";
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
const TAG = process.env.KLARO_RUN_TAG || "qa";
const shots = path.resolve("e2e/.goal-action-shots");
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[wact ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: vendor, chain: ARC, transport: http() });
log("vendor injected:", vendor.address);

let rpcId = 0, nextNonce = null;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
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
    case "eth_signTypedData_v4": {
      const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const types = { ...td.types }; delete types.EIP712Domain;
      const domain = { ...td.domain }; if (domain.chainId != null) domain.chainId = Number(domain.chainId);
      log("signing typed data:", td.primaryType);
      return await vendor.signTypedData({ domain, types, primaryType: td.primaryType, message: td.message });
    }
    case "eth_sendTransaction": {
      const tx = params[0] || {};
      if (nextNonce === null) nextNonce = await pub.getTransactionCount({ address: vendor.address, blockTag: "pending" });
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

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: vrow } = await admin.from("vendors").select("id").eq("email", "xprtqk@gmail.com").maybeSingle();
const vendorId = vrow.id;
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.exposeFunction("__klaroBridge", bridge);
await ctx.addInitScript({ content: shimContent });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/error|revert|insufficient|fail/i.test(t) && !/reown|allowlist|403/i.test(t)) log("page:", t.slice(0, 140)); });
const shot = async (l) => { try { await page.screenshot({ path: path.join(shots, l + ".png") }); } catch {} };
await page.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor")}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
const results = {};
const connectIfShown = async () => {
  const c = page.locator("button", { hasText: /Connect wallet/i }).first();
  if (await c.isVisible({ timeout: 4000 }).catch(() => false)) { await c.click().catch(() => {}); await page.waitForTimeout(2500); }
  const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
  if (await sw.isVisible({ timeout: 2500 }).catch(() => false)) { await sw.click().catch(() => {}); await page.waitForTimeout(2000); }
};

// ── A. Webhook add (reachable URL) ──────────────────────────────────────────
if (!process.env.KLARO_ONLY_CASHOUT) try {
  const url = `https://httpbin.org/post?klaro-qa-${TAG}`;
  await page.goto(BASE + "/vendor/integrations/webhooks", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button:has-text('Add endpoint')", { timeout: 15000 });
  await page.fill('input[placeholder*="klaro-webhook"], input[type="url"], input[placeholder*="yourapp"]', url);
  await page.locator("button:has-text('Add endpoint')").click();
  await page.waitForTimeout(4000);
  await shot("A-webhook");
  const { data: hooks } = await admin.from("webhooks").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(3);
  const found = (hooks ?? []).find((h) => JSON.stringify(h).includes("httpbin.org"));
  results.webhook = found ? `PASS (row id=${found.id}, url=${found.url})` : `CHECK (page: ${(await page.evaluate(() => document.body.innerText).catch(() => "")).match(/reachable|blocked|added|error[^.]*/i)?.[0] ?? "?"})`;
  if (found) { await admin.from("webhooks").delete().eq("id", found.id); log("webhook test row cleaned"); }
} catch (e) { results.webhook = "ERR " + String(e).slice(0, 120); }
log("webhook:", results.webhook);

// ── B. Payment-link create (sign authorization) ─────────────────────────────
if (!process.env.KLARO_ONLY_CASHOUT) try {
  const before = (await admin.from("payment_links").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? 0;
  await page.goto(BASE + "/vendor/links/new", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.locator('input[type="number"]').first().fill("2").catch(() => {});
  await page.getByPlaceholder(/label|optional/i).first().fill(`QA goal link ${TAG}`).catch(() => {});
  await connectIfShown();
  await shot("B-link-connected");
  const signBtn = page.locator("button", { hasText: /Sign & create link|Create link|Sign and create/i }).first();
  if (await signBtn.isVisible({ timeout: 5000 }).catch(() => false)) { await signBtn.click().catch(() => {}); await page.waitForTimeout(5000); }
  else log("link sign button not visible. body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
  await shot("B-link-after");
  const { data: links, count: after } = await admin.from("payment_links").select("id,slug,amount_usdc,label", { count: "exact" }).eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(1);
  results.link = (after ?? 0) > before ? `PASS (slug=${links?.[0]?.slug}, label="${links?.[0]?.label}", ${before}→${after})` : `CHECK (count ${before}→${after})`;
} catch (e) { results.link = "ERR " + String(e).slice(0, 120); }
log("link:", results.link);

// ── C. Cashout submit (requestAndLock on-chain) ─────────────────────────────
try {
  const before = (await admin.from("cashout_orders").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? 0;
  await page.goto(BASE + "/vendor/cashout", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.locator('input[type="number"]').first().fill("2").catch(() => {});
  await page.waitForTimeout(1500); // let the quote compute
  await connectIfShown();
  await shot("C-cashout-connected");
  const reqBtn = page.locator("button", { hasText: /Lock USDC|Request cashout|Lock .* cashout|Sign .* lock|Cash out now/i }).first();
  if (await reqBtn.isVisible({ timeout: 5000 }).catch(() => false)) { log("clicking:", (await reqBtn.innerText().catch(() => "?"))); await reqBtn.click().catch(() => {}); }
  else log("cashout request button not visible. buttons:", (await page.locator("button").allInnerTexts().catch(() => [])).slice(0, 12).join(" | "));
  // wait for a new cashout_orders row
  let after = before;
  for (let i = 0; i < 25; i++) { await page.waitForTimeout(2000); after = (await admin.from("cashout_orders").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId)).count ?? before; if (after > before) break; }
  await shot("C-cashout-after");
  const { data: co } = await admin.from("cashout_orders").select("id,status,usdc_amount,lock_tx_hash").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(1);
  results.cashout = after > before ? `PASS (id=${co?.[0]?.id?.slice(0, 12)}…, status=${co?.[0]?.status}, lock_tx=${co?.[0]?.lock_tx_hash ? "set" : "null"})` : `CHECK (count ${before}→${after}; url=${page.url()})`;
} catch (e) { results.cashout = "ERR " + String(e).slice(0, 140); }
log("cashout:", results.cashout);

await browser.close();
console.log("\n===== WALLET-GATED LIVE ACTIONS =====");
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(10), v);
console.log("screenshots:", shots);
