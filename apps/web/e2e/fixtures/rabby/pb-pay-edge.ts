// P-B pay EDGE matrix. Modes (env EDGE): "double" (double-click idempotency),
// "reject" (buyer rejects EIP-712 → graceful cancel), "insufficient" (balance <
// amount → blocked UX). Records video (review→log→delete). Injected buyer wallet.
//   tsx pb-pay-edge.ts <publishedInvoiceId>   EDGE=double|reject|insufficient
import { readFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(file) { const o = {}; for (const l of readFileSync(file, "utf8").split(/\r?\n/)) { if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ""); } return o; }
const local = env(path.resolve(".env.local"));
const wallets = env(path.resolve("e2e/wallets/.env.test-wallets"));
const BASE = "http://localhost:3100";
const RPC = local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5_042_002;
const INVOICE = process.argv[2];
const MODE = process.env.EDGE || "double";
if (!INVOICE) { console.error("usage: pb-pay-edge.ts <invoiceId>  EDGE=double|reject|insufficient"); process.exit(2); }
const ESCROW = local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS;
const USDC = "0x3600000000000000000000000000000000000000";
const shots = path.resolve("e2e/.pb-vid");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
mkdirSync(shots, { recursive: true });
let n = 0; const log = (...a) => console.log(`[edge:${MODE} ${++n}]`, ...a);

const ARC = { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const buyer = privateKeyToAccount(wallets.CUSTOMER_TEST_PRIVATE_KEY);
const pub = createPublicClient({ chain: ARC, transport: http() });
const wallet = createWalletClient({ account: buyer, chain: ARC, transport: http() });
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const ESC_ABI = parseAbi(["function invoices(bytes32) view returns (address vendor, address token, uint256 amount, uint64 dueAt, uint64 acceptedAt, address acceptedBy, bytes32 metadataHash, bytes32 screeningHash, bytes32 splitsHash, uint8 status)"]);

let nextNonce = null;
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
      if (MODE === "reject") { log("buyer REJECTS the signature"); throw { code: 4001, message: "User rejected the request." }; }
      const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const types = { ...td.types }; delete types.EIP712Domain;
      const domain = { ...td.domain }; if (domain.chainId != null) domain.chainId = Number(domain.chainId);
      return await buyer.signTypedData({ domain, types, primaryType: td.primaryType, message: td.message });
    }
    case "eth_sendTransaction": {
      const tx = params[0] || {};
      if (nextNonce === null) nextNonce = await pub.getTransactionCount({ address: buyer.address, blockTag: "pending" });
      const nonce = nextNonce++;
      const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, nonce, gas: 1_500_000n });
      log("tx broadcast", hash.slice(0, 14), "nonce", nonce);
      return hash;
    }
    default: { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; }
  }
}
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const shim = `(function(){var c=${JSON.stringify(CHAIN_HEX)},L={},p={isKlaroTestWallet:true,isMetaMask:false,chainId:c,request:function(a){return window.__klaroBridge(JSON.stringify(a));},on:function(e,f){(L[e]=L[e]||[]).push(f);return p;},addListener:function(e,f){return p.on(e,f);},removeListener:function(e,f){L[e]=(L[e]||[]).filter(function(x){return x!==f;});return p;},removeAllListeners:function(){for(var k in L)L[k]=[];return p;}};window.ethereum=p;var info={uuid:"00000000-0000-0000-0000-0000000c1a70",name:"Klaro Test Wallet",icon:"data:image/svg+xml;base64,PHN2Zy8+",rdns:"io.klaro.testwallet"};function an(){window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:Object.freeze({info:info,provider:p})}));}window.addEventListener("eip6963:requestProvider",an);an();})();`;

const before = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] });
const balBefore = await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [buyer.address] });
log("before: invoice status", Number(before[9]), "buyer USDC", Number(balBefore) / 1e6);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: shots, size: { width: 1280, height: 900 } } });
await context.exposeFunction("__klaroBridge", bridge);
await context.addInitScript({ content: shim });
const page = await context.newPage();
page.on("console", (m) => { const t = m.text(); if (/error|insufficient|cancel|reject/i.test(t)) log("page:", t.slice(0, 140)); });

await page.goto(`${BASE}/i/${INVOICE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
// click the VISIBLE Connect button (page renders desktop+mobile dupes)
const cc = page.getByRole("button", { name: /Connect wallet/i });
const ccn = await cc.count();
for (let i = 0; i < ccn; i++) { if (await cc.nth(i).isVisible().catch(() => false)) { await cc.nth(i).click().catch(() => {}); log("clicked visible Connect", i); break; } }
await page.waitForTimeout(3000);
// confirm connected (Pay button appears) before proceeding
const payReady = await page.getByRole("button", { name: /Pay invoice in USDC|Insufficient USDC/i }).first().isVisible({ timeout: 8000 }).catch(() => false);
log("connected (pay/insufficient visible):", payReady);

if (MODE === "insufficient") {
  const bodyTxt = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
  const insufBtn = await page.getByRole("button", { name: /Insufficient USDC/i }).first().isVisible().catch(() => false);
  const hasFaucetHint = /Get testnet USDC|need at least|faucet/i.test(bodyTxt);
  log("Insufficient button shown:", insufBtn, "· faucet hint:", hasFaucetHint);
  console.log("EDGE_OK=" + (insufBtn && hasFaucetHint));
} else {
  // find visible Pay button
  const cands = page.getByRole("button", { name: /Pay invoice in USDC/i });
  const cnt = await cands.count(); let payIdx = -1;
  for (let i = 0; i < cnt; i++) if (await cands.nth(i).isVisible().catch(() => false)) { payIdx = i; break; }
  if (payIdx < 0) { log("no visible Pay button. body:", (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200)); }
  else if (MODE === "double") {
    // double-fire synchronously in-page (before React disables) to stress idempotency
    await page.evaluate((idx) => {
      const btns = [...document.querySelectorAll("button")].filter((b) => /Pay invoice in USDC/i.test(b.textContent || ""));
      const b = btns.filter((x) => x.offsetParent !== null)[idx] || btns[0];
      b.click(); b.click();
    }, payIdx);
    log("double-fired Pay");
  } else { await cands.nth(payIdx).click().catch(() => {}); log("clicked Pay (reject mode)"); }

  // wait for outcome
  let acc = false;
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1500); const o = await pub.readContract({ address: ESCROW, abi: ESC_ABI, functionName: "invoices", args: [INVOICE] }).catch(() => null); if (o && o[5].toLowerCase() === buyer.address.toLowerCase()) { acc = true; break; } if (MODE === "reject" && i > 5) break; }
  const balAfter = await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [buyer.address] });
  const delta = Number(balBefore - balAfter) / 1e6;
  const bodyTxt = (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
  log("after: acceptedBy=buyer", acc, "· USDC delta", delta, "· UI:", bodyTxt.slice(0, 120));
  if (MODE === "double") console.log("EDGE_OK=" + (acc && delta === 1)); // exactly one payment, no double-charge
  else if (MODE === "reject") console.log("EDGE_OK=" + (!acc && delta === 0 && /cancel/i.test(bodyTxt))); // no pay, graceful cancel
}

await context.close(); // flushes video
const vids = readdirSync(shots).filter((f) => f.endsWith(".webm"));
log("video captured:", vids[0] || "none", "(deleted after log)");
try { rmSync(shots, { recursive: true, force: true }); } catch {}
await browser.close();
process.exit(0);
