// P-B buyer-pay leg: verify PayWithUSDC end-to-end through the REAL public
// invoice page (/i/[id]) with an injected buyer wallet. Drives the live path:
// EIP-712 acceptance sign → approve → acceptAndPay. Same headless injected
// EIP-1193 provider pattern as pb-inject (key stays in Node). No login — the
// payer is an anonymous buyer who connects their wallet.
//
// Usage: tsx pb-pay.ts <publishedInvoiceId>
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
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
const BASE = "http://127.0.0.1:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const INVOICE = process.argv[2];
if (!INVOICE) { console.error("usage: pb-pay.ts <invoiceId>"); process.exit(2); }
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[pay ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const buyer = privateKeyToAccount(process.env.QA_BUYER_KEY || wallets.CUSTOMER_TEST_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: buyer, chain: ARC, transport: http() });
log("buyer (injected account):", buyer.address);

let rpcId = 0;
async function rpcForward(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
// Explicit nonce so approve + acceptAndPay (fired back-to-back, no receipt wait
// in PayWithUSDC) get sequential nonces instead of racing the same one.
let nextNonce = null;
async function bridge(argsJson) {
  const { method, params = [] } = JSON.parse(argsJson);
  log("bridge:", method);
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts": return [buyer.address];
    case "eth_chainId": return "0x" + CHAIN_ID.toString(16);
    case "net_version": return String(CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
    case "wallet_watchAsset": return null;
    case "wallet_requestPermissions":
    case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
    case "personal_sign":
      return await wallet.signMessage({ account: buyer, message: { raw: params[0] } });
    case "eth_signTypedData_v4": {
      const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const types = { ...td.types }; delete types.EIP712Domain; // viem derives domain from `domain`
      const domain = { ...td.domain };
      if (domain.chainId != null) domain.chainId = Number(domain.chainId);
      const sig = await buyer.signTypedData({ domain, types, primaryType: td.primaryType, message: td.message });
      log("signed typed data (acceptance)");
      return sig;
    }
    case "eth_sendTransaction": {
      const tx = params[0] || {};
      if (nextNonce === null) nextNonce = await pub.getTransactionCount({ address: buyer.address, blockTag: "pending" });
      const nonce = nextNonce++;
      // Explicit gas so viem skips eth_estimateGas — acceptAndPay is sent
      // before approve mines, so estimation would revert (allowance still 0).
      // Sequential nonces guarantee approve executes first; transferFrom then
      // sees the allowance. 1.5M covers acceptAndPay's transferFrom + events.
      const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce, gas: 1_500_000n });
      log("eth_sendTransaction -> broadcast", hash, "nonce", nonce);
      return hash;
    }
    default: return await rpcForward(method, params);
  }
}

const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const shimContent = `
(function(){
  var chainHex = ${JSON.stringify(CHAIN_HEX)};
  var listeners = {};
  var provider = {
    isKlaroTestWallet: true, isMetaMask: false, chainId: chainHex,
    request: function(args){ return window.__klaroBridge(JSON.stringify(args)); },
    on: function(ev, cb){ (listeners[ev] = listeners[ev] || []).push(cb); return provider; },
    addListener: function(ev, cb){ return provider.on(ev, cb); },
    removeListener: function(ev, cb){ listeners[ev] = (listeners[ev]||[]).filter(function(f){ return f!==cb; }); return provider; },
    removeAllListeners: function(){ for (var k in listeners) listeners[k]=[]; return provider; }
  };
  window.ethereum = provider;
  var info = { uuid: "00000000-0000-0000-0000-0000000c1a70", name: "Klaro Test Wallet", icon: "data:image/svg+xml;base64,PHN2Zy8+", rdns: "io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.exposeFunction("__klaroBridge", bridge);
await context.addInitScript({ content: shimContent });
const page = await context.newPage();
page.on("console", (m) => { const t = m.text(); if (/error|insufficient|revert/i.test(t)) log("page:", t.slice(0, 160)); });

const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const before = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] });
log("before: status", Number(before[9]), "acceptedBy", before[5]);

await page.goto(`${BASE}/i/${INVOICE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on pay page:", page.url());

const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 6000 }).catch(() => false)) { log("clicking Connect"); await connect.click().catch(() => {}); await page.waitForTimeout(2000); }
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 3000 }).catch(() => false)) { log("switch chain"); await sw.click().catch(() => {}); await page.waitForTimeout(1500); }

// /i/[id] renders PayWithUSDC twice (desktop + mobile) — click the VISIBLE one.
const candidates = page.getByRole("button", { name: /Pay invoice in USDC/i });
const cnt = await candidates.count();
let clicked = false;
for (let i = 0; i < cnt; i++) {
  const b = candidates.nth(i);
  if (await b.isVisible().catch(() => false)) {
    log("clicking Pay (visible button", i + ")");
    await b.click().catch(() => {});
    clicked = true;
    break;
  }
}
if (!clicked) log("Pay button NOT visible (count=" + cnt + "). body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
// wait for on-chain acceptedBy to flip
let ok = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1500);
  const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] }).catch(() => null);
  if (o && o[5].toLowerCase() === buyer.address.toLowerCase()) { ok = true; log("PAID on-chain: status", Number(o[9]), "acceptedBy", o[5]); break; }
}
const uiPaid = /paid|settl|receipt|thank/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
log("UI shows paid/receipt state:", uiPaid);
try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
console.log("PAY_OK=" + ok);
process.exit(ok ? 0 : 1);
