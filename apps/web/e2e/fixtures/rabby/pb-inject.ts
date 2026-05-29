// LF-2 solution: headless injected EIP-1193 provider for deterministic wallet
// E2E. Replaces the flaky Rabby MV3 popup with a Node-side viem signer. The
// dApp code path (wagmi injected() connector -> PublishInvoiceOnChain ->
// writeContractAsync(createInvoice)) is exercised IDENTICALLY to a real wallet;
// only the wallet chrome is swapped. The vendor key never enters the browser —
// the page forwards eth_sendTransaction params to Node, Node signs + broadcasts.
//
// Drives: login (service-role token_hash) -> /vendor/invoices/<id> -> Connect
// -> Publish -> real on-chain createInvoice -> 6-dim verify.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
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
const BASE = "http://localhost:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const INVOICE = (process.argv[2] || "0xeedc734617de5e69b50f72ad86da4201ca7763f6cd0a4061fd9fd8edca5d0814") as `0x${string}`;
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`;
const shots = path.resolve("e2e/.pb-shots");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a: unknown[]) => console.log(`[inj ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const vendor = privateKeyToAccount(wallets.LP_TEST_PRIVATE_KEY as `0x${string}`);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: vendor, chain: ARC, transport: http() });
log("vendor (injected account):", vendor.address);

// ── Node-side EIP-1193 bridge. Key stays here; reads forward to Arc RPC. ──
let rpcId = 0;
async function rpcForward(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function bridge(argsJson: string) {
  const { method, params = [] } = JSON.parse(argsJson) as { method: string; params?: unknown[] };
  log("bridge:", method);
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return [vendor.address];
    case "eth_chainId":
      return "0x" + CHAIN_ID.toString(16);
    case "net_version":
      return String(CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
    case "wallet_watchAsset":
      return null;
    case "wallet_requestPermissions":
    case "wallet_getPermissions":
      return [{ parentCapability: "eth_accounts" }];
    case "personal_sign": {
      const message = params[0] as `0x${string}`;
      return await wallet.signMessage({ account: vendor, message: { raw: message } });
    }
    case "eth_signTypedData_v4": {
      const td = typeof params[1] === "string" ? JSON.parse(params[1] as string) : params[1];
      return await vendor.signTypedData(td);
    }
    case "eth_sendTransaction": {
      const tx = (params[0] || {}) as { to?: `0x${string}`; data?: `0x${string}`; value?: string };
      const hash = await wallet.sendTransaction({
        to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n,
      });
      log("eth_sendTransaction -> broadcast", hash);
      return hash;
    }
    default:
      return await rpcForward(method, params as unknown[]);
  }
}

// ── In-page provider shim as plain-JS content (no transpilation, unambiguous
// doc-start injection). Sets window.ethereum + EIP-6963 announce. ──
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const shimContent = `
(function(){
  var chainHex = ${JSON.stringify(CHAIN_HEX)};
  var listeners = {};
  var provider = {
    isKlaroTestWallet: true,
    isMetaMask: false,
    chainId: chainHex,
    request: function(args){ return window.__klaroBridge(JSON.stringify(args)); },
    on: function(ev, cb){ (listeners[ev] = listeners[ev] || []).push(cb); return provider; },
    addListener: function(ev, cb){ return provider.on(ev, cb); },
    removeListener: function(ev, cb){ listeners[ev] = (listeners[ev]||[]).filter(function(f){ return f!==cb; }); return provider; },
    removeAllListeners: function(){ for (var k in listeners) listeners[k]=[]; return provider; }
  };
  window.ethereum = provider;
  window.__klaroShimRan = true;
  var info = { uuid: "00000000-0000-0000-0000-0000000c1a70", name: "Klaro Test Wallet", icon: "data:image/svg+xml;base64,PHN2Zy8+", rdns: "io.klaro.testwallet" };
  function announce(){ window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`;

// ── Login: mint a real Supabase session for the vendor ──
const admin = createClient(local.SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: "magiclink", email: "xprtqk@gmail.com" });
if (lerr || !link.properties?.hashed_token) { console.error("login mint failed", lerr?.message); process.exit(2); }
const callback = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/vendor/invoices/" + INVOICE)}`;

// ── Launch plain Chromium (no extension), wire the provider ──
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.exposeFunction("__klaroBridge", bridge);
await context.addInitScript({ content: shimContent });
const page = await context.newPage();
page.on("console", (m) => { const t = m.text(); if (/error|wagmi|connect|provider/i.test(t)) log("page:", t.slice(0, 160)); });
const shot = async (l: string) => { try { await page.screenshot({ path: path.join(shots, `${l}.png`) }); } catch {} };

await page.goto(callback, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
log("on page:", page.url());
await shot("10-detail");

// Probe: did the shim run? is the provider + bridge present?
const probe = await page.evaluate(async () => {
  const w = window as any;
  const base = { shimRan: w.__klaroShimRan ?? false, hasEth: typeof w.ethereum, hasBridge: typeof w.__klaroBridge, isKlaro: w.ethereum?.isKlaroTestWallet };
  try {
    if (!w.ethereum) return base;
    return { ...base, chainId: await w.ethereum.request({ method: "eth_chainId" }), accts: await w.ethereum.request({ method: "eth_accounts" }) };
  } catch (e) { return { ...base, err: String(e) }; }
});
log("provider probe:", JSON.stringify(probe));

// Connect (click if shown; injected may auto-connect)
const connect = page.locator("button", { hasText: /Connect wallet/i }).first();
if (await connect.isVisible({ timeout: 6000 }).catch(() => false)) {
  log("clicking Connect wallet"); await connect.click().catch(() => {});
  await page.waitForTimeout(2000);
}
await shot("12-after-connect");

// Switch chain (should be skipped — provider reports Arc — but handle if shown)
const sw = page.locator("button", { hasText: /Switch to Arc/i }).first();
if (await sw.isVisible({ timeout: 3000 }).catch(() => false)) {
  log("clicking Switch to Arc"); await sw.click().catch(() => {});
  await page.waitForTimeout(2000);
}

// Publish
const pubBtn = page.locator("button", { hasText: /Publish invoice on-chain/i }).first();
if (await pubBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
  log("clicking Publish invoice on-chain"); await pubBtn.click().catch(() => {});
} else {
  log("Publish button NOT visible. body:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
}
// wait for "Published on-chain"
let published = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  published = /Published on-chain/i.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
  if (published) break;
}
await shot("16-final");
log("UI shows 'Published on-chain':", published);

// ── 6-dim verify (on-chain + DB) ──
const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);
const oc = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] }).catch(() => null);
const onChainStatus = oc ? Number(oc[9]) : -1;
const onChainVendor = oc ? oc[0] : "n/a";
log("ON-CHAIN status:", onChainStatus, "(1=CREATED) vendor:", onChainVendor);
const { data: row } = await admin.from("invoices").select("published_tx_hash,status").eq("id", INVOICE).maybeSingle();
log("DB published_tx_hash:", row?.published_tx_hash ?? "null", "status:", row?.status);

const ok = published && onChainStatus === 1 && onChainVendor.toLowerCase() === vendor.address.toLowerCase() && !!row?.published_tx_hash;
console.log("PUBLISH_OK=" + ok);
try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
process.exit(ok ? 0 : 1);
