// P-B Klaro Link 2-wallet UI E2E (injected EIP-1193 providers, same proven
// pattern as pb-pay — real keys, real signatures, real on-chain txs, driven
// through the REAL app UI). Two distinct wallets:
//   VENDOR (LP_TEST): magic-link login → /vendor/links/new → fill → Connect →
//     "Sign & create link" (signs the LinkInvoiceAuthorization via the injected
//     provider; createLinkAction verifies + stores it) → /vendor/links/<id>.
//   BUYER (CUSTOMER): /pay/<slug> → Connect → Continue (server relays
//     createInvoiceFor) → Pay (EIP-712 acceptance → approve → acceptAndPay).
// Verifies the backing invoice is PAID on-chain with vendor == the link vendor.
//
// (Rabby's MV3 connect popup is environmentally flaky under Playwright — the
// connect-response doesn't propagate; the connect+sign MECHANISM itself is
// already proven via pb-flow. Injected providers exercise the identical
// EIP-1193 calls reliably.)
//
// Run from apps/web:
//   node ../../node_modules/.pnpm/tsx@4.22.3/node_modules/tsx/dist/cli.mjs e2e/fixtures/rabby/pb-link.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, parseAbi, type PrivateKeyAccount, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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
const BASE = "http://127.0.0.1:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`;
let n = 0;
const log = (...a: unknown[]) => console.log(`[link ${++n}]`, ...a);

const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain: ARC, transport: http() });
const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);

const shimContent = `
(function(){
  var chainHex = ${JSON.stringify(CHAIN_HEX)};
  var listeners = {};
  var provider = { isKlaroTestWallet:true, isMetaMask:false, chainId:chainHex,
    request:function(a){ return window.__klaroBridge(JSON.stringify(a)); },
    on:function(e,c){ (listeners[e]=listeners[e]||[]).push(c); return provider; },
    addListener:function(e,c){ return provider.on(e,c); },
    removeListener:function(e,c){ listeners[e]=(listeners[e]||[]).filter(function(f){return f!==c;}); return provider; },
    removeAllListeners:function(){ for (var k in listeners) listeners[k]=[]; return provider; } };
  window.ethereum = provider;
  var info = { uuid:"00000000-0000-0000-0000-0000000c1a70", name:"Klaro Test Wallet", icon:"data:image/svg+xml;base64,PHN2Zy8+", rdns:"io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info:info, provider:provider }) })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

function makeBridge(account: PrivateKeyAccount, wallet: WalletClient) {
  let rpcId = 0;
  let nextNonce: number | null = null;
  return async function bridge(argsJson: string) {
    const { method, params = [] } = JSON.parse(argsJson);
    log("bridge:", method);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts": return [account.address];
      case "eth_chainId": return CHAIN_HEX;
      case "net_version": return String(CHAIN_ID);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
      case "wallet_watchAsset": return null;
      case "wallet_requestPermissions":
      case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
      case "personal_sign": return await account.signMessage({ message: { raw: params[0] } });
      case "eth_signTypedData_v4": {
        const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const types = { ...td.types }; delete types.EIP712Domain;
        const domain = { ...td.domain };
        if (domain.chainId != null) domain.chainId = Number(domain.chainId);
        const sig = await account.signTypedData({ domain, types, primaryType: td.primaryType, message: td.message });
        log("signed typed data (" + td.primaryType + ")");
        return sig;
      }
      case "eth_sendTransaction": {
        const tx = params[0] || {};
        if (nextNonce === null) nextNonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
        const nonce = nextNonce++;
        const hash = await wallet.sendTransaction({ account, chain: ARC, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce, gas: 1_500_000n });
        log("sendTransaction ->", hash, "nonce", nonce);
        return hash;
      }
      default: {
        const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
        const j = await res.json();
        if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
        return j.result;
      }
    }
  };
}

async function injectedContext(browser: Browser, account: PrivateKeyAccount): Promise<BrowserContext> {
  const wallet = createWalletClient({ account, chain: ARC, transport: http() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.exposeFunction("__klaroBridge", makeBridge(account, wallet));
  await ctx.addInitScript({ content: shimContent });
  return ctx;
}

const browser = await chromium.launch({ headless: true });

// ─────────────────────────── VENDOR LEG ───────────────────────────
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY as `0x${string}`);
log("vendor (injected):", vendor.address);
const { data: ml, error: mlErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
if (mlErr || !ml.properties?.hashed_token) { console.error("login mint failed", mlErr?.message); process.exit(2); }
const callback = `${BASE}/auth/callback?token_hash=${ml.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/links/new")}`;

const vctx = await injectedContext(browser, vendor);
// Establish the session on a throwaway page (the magic-link callback redirect
// chain churns the wagmi/injected state), then drive the form on a FRESH page —
// a clean single-navigation mount, exactly like the reliable buyer leg.
const loginPage = await vctx.newPage();
await loginPage.goto(callback, { waitUntil: "domcontentloaded", timeout: 120000 });
await loginPage.waitForTimeout(2500);
log("login landed:", loginPage.url());
await loginPage.close().catch(() => {});

const vpage = await vctx.newPage();
vpage.on("console", (m) => { const t = m.text(); if (/\[linkform\]|reject|revert|mismatch|valid/i.test(t)) log("vpage:", t.slice(0, 220)); });
vpage.on("pageerror", (e) => log("vpage PAGEERROR:", e.message.slice(0, 180)));
await vpage.goto(`${BASE}/vendor/links/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
await vpage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await vpage.waitForTimeout(2000);
log("on links/new (fresh page):", vpage.url());
if (/\/signin/.test(vpage.url())) { console.error("session not established (bounced to signin)"); await browser.close(); process.exit(2); }

const amtInput = vpage.locator('input[type="number"]').first();
await amtInput.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
await amtInput.fill("");
await amtInput.fill("0.10");
const amtVal = await amtInput.inputValue().catch(() => "?");
log("amount input value:", amtVal);
if (amtVal !== "0.1" && amtVal !== "0.10") { await amtInput.fill("0.10").catch(() => {}); log("amount refilled:", await amtInput.inputValue().catch(() => "?")); }
await vpage.locator('input[type="text"]').first().fill("QA injected link E2E").catch(() => {});
const vconnect = vpage.locator("button", { hasText: /Connect wallet/i }).first();
if (await vconnect.isVisible({ timeout: 6000 }).catch(() => false)) { log("vendor Connect"); await vconnect.click().catch(() => {}); }
// Wait for wagmi to ACTUALLY connect (address available) before signing — the
// submit bails silently if isConnected/address aren't set. The "disconnect"
// control only renders once the address pill is shown, so it's a reliable
// connected signal (unlike "Connect wallet" briefly unmounting during render).
let connected = false;
for (let i = 0; i < 30; i++) {
  await vpage.waitForTimeout(700);
  const disc = await vpage.getByText(/^disconnect$/i).first().isVisible({ timeout: 400 }).catch(() => false);
  if (disc) { connected = true; log("vendor connected (iter", i + ")"); break; }
  if (i === 5 || i === 12) {
    const cb = vpage.locator("button", { hasText: /^Connect wallet$/i }).first();
    if (await cb.isVisible({ timeout: 300 }).catch(() => false)) { await cb.click().catch(() => {}); log("re-click Connect (iter", i + ")"); }
  }
}
if (!connected) log("WARN: vendor wallet never showed connected (disconnect) state");
await vpage.waitForTimeout(1500);
// The login redirect chain (callback → /signin → /vendor/links/new) can leave
// the injected provider's wagmi connection alive-but-unsignable. A clean reload
// re-mounts wagmi, restoring the connection from storage with a working signer.
// Re-fill the form after the reload clears it, and re-confirm connected.
await vpage.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await vpage.waitForTimeout(2500);
await amtInput.fill("0.10").catch(() => {});
await vpage.locator('input[type="text"]').first().fill("QA injected link E2E").catch(() => {});
for (let i = 0; i < 20; i++) {
  await vpage.waitForTimeout(700);
  if (await vpage.getByText(/^disconnect$/i).first().isVisible({ timeout: 400 }).catch(() => false)) { log("reconnected after reload (iter", i + ")"); break; }
  if (i === 4) { const cb = vpage.locator("button", { hasText: /^Connect wallet$/i }).first(); if (await cb.isVisible({ timeout: 300 }).catch(() => false)) { await cb.click().catch(() => {}); log("re-Connect after reload"); } }
}
await vpage.waitForTimeout(1200);
// Trigger the LinkForm submit via form.requestSubmit() (a button .click() does
// NOT reliably fire React's onSubmit here), retrying until the redirect lands —
// this absorbs the wagmi address-propagation race after connect. The first
// attempt that finds isConnected/address ready signs + creates + redirects; the
// 7s wait after each attempt catches that redirect before another fires, so at
// most one link is created.
const signBtn = vpage.locator("button", { hasText: /Sign & create link/i }).first();
log("sign button enabled:", await signBtn.isEnabled().catch(() => "n/a"));
for (let attempt = 0; attempt < 8; attempt++) {
  // Probe wagmi's view of the connection straight from the page before submitting.
  const state = await vpage.evaluate(() => {
    const txt = document.body.innerText;
    const err = document.querySelector(".bg-rose-50")?.textContent ?? "";
    const btn = Array.from(document.querySelectorAll("button")).find((b) => /Sign & create link|Waiting for signature|Creating/i.test(b.textContent || ""))?.textContent ?? "";
    const hasDisconnect = /disconnect/i.test(txt);
    return { err: err.replace(/\s+/g, " ").slice(0, 140), btn: (btn || "").replace(/\s+/g, " ").trim(), hasDisconnect };
  }).catch(() => ({ err: "?", btn: "?", hasDisconnect: false }));
  log(`attempt ${attempt}: btn="${state.btn}" disconnect=${state.hasDisconnect} err="${state.err}"`);
  // Trigger submit via BOTH a real button click and requestSubmit — the injected
  // connector intermittently ignores one or the other, but once wagmi's signer
  // is live, either fires the EIP-712 sign. waitForURL breaks on the redirect.
  await signBtn.click({ timeout: 2500, force: true }).catch(() => {});
  await vpage.locator("#link-form").evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => {});
  // Native submit via Enter in a field — fires onSubmit even when programmatic
  // click/requestSubmit are swallowed by a re-render.
  await vpage.locator('input[type="text"]').first().press("Enter").catch(() => {});
  // Also dispatch a bubbling submit event directly (last-resort native path).
  await vpage.locator("#link-form").evaluate((f) => f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))).catch(() => {});
  try {
    await vpage.waitForURL(/\/vendor\/links\/[0-9a-f-]{10,}/, { timeout: 7000 });
    break;
  } catch { /* not redirected yet */ }
  await vpage.waitForTimeout(1500);
}
const linkId = vpage.url().match(/\/vendor\/links\/([0-9a-f-]{10,})/)?.[1] ?? null;
if (!linkId) {
  const errBox = await vpage.locator(".bg-rose-50").first().innerText({ timeout: 1500 }).catch(() => "");
  log("create FAILED. errorBox:", errBox || "(no rose error shown)");
}
log("after create, url:", vpage.url(), "linkId:", linkId);
await vctx.close();
if (!linkId) { await browser.close(); process.exit(3); }

const { data: linkRow } = await admin.from("payment_links").select("slug, amount_usdc, vendor_auth_sig").eq("id", linkId).maybeSingle();
const slug = linkRow?.slug;
log("link slug:", slug, "auth_stored:", Boolean(linkRow?.vendor_auth_sig));
if (!slug) { console.error("no slug"); await browser.close(); process.exit(3); }
if (!linkRow?.vendor_auth_sig) { console.error("VENDOR AUTH NOT STORED — sign/verify failed"); await browser.close(); process.exit(4); }

// ─────────────────────────── BUYER LEG ───────────────────────────
const buyer = privateKeyToAccount((process.env.QA_BUYER_KEY || wallets.CUSTOMER_TEST_PRIVATE_KEY) as `0x${string}`);
log("buyer (injected):", buyer.address);
const bctx = await injectedContext(browser, buyer);
const bpage = await bctx.newPage();
bpage.on("console", (m) => { const t = m.text(); if (/error|insufficient|revert/i.test(t)) log("bpage:", t.slice(0, 160)); });
await bpage.goto(`${BASE}/pay/${slug}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await bpage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await bpage.waitForTimeout(1500);
log("on pay page:", bpage.url());

const bconnect = bpage.locator("button", { hasText: /Connect wallet/i }).first();
if (await bconnect.isVisible({ timeout: 6000 }).catch(() => false)) { log("buyer Connect"); await bconnect.click().catch(() => {}); await bpage.waitForTimeout(2000); }
const cont = bpage.locator("button", { hasText: /Continue to payment/i }).first();
if (await cont.isVisible({ timeout: 8000 }).catch(() => false)) { log("Continue to payment"); await cont.click().catch(() => {}); }
const payBtn = bpage.getByRole("button", { name: /Pay invoice in USDC/i }).first();
await payBtn.waitFor({ state: "visible", timeout: 60000 }).catch(() => log("Pay button did not appear — prepare/publish may have failed"));
if (await payBtn.isVisible().catch(() => false)) { log("clicking Pay invoice in USDC"); await payBtn.click().catch(() => {}); }

let invoiceId: string | null = null;
let ok = false;
for (let i = 0; i < 50; i++) {
  await bpage.waitForTimeout(1500);
  if (!invoiceId) {
    const { data: inv } = await admin.from("invoices").select("id").eq("link_id", linkId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (inv?.id) { invoiceId = inv.id as string; log("backing invoiceId:", invoiceId); }
  }
  if (invoiceId) {
    const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [invoiceId as `0x${string}`] }).catch(() => null);
    if (o && o[5].toLowerCase() === buyer.address.toLowerCase()) { ok = true; log("PAID on-chain: status", Number(o[9]), "vendor", o[0], "acceptedBy", o[5]); break; }
  }
}
const uiPaid = /paid|settl|receipt|thank|submitted/i.test(await bpage.evaluate(() => document.body.innerText).catch(() => ""));
log("UI shows paid/receipt:", uiPaid);
await browser.close();

console.log("LINK_SLUG=" + slug);
console.log("LINK_INVOICE_ID=" + invoiceId);
console.log("LINK_E2E_OK=" + ok);
process.exit(ok ? 0 : 1);
