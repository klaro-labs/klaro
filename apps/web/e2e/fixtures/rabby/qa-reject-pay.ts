// Adversarial: buyer connects, clicks Pay, then REJECTS the Rabby signature
// popup. Verify the app surfaces a calm error, stays recoverable (Pay still
// available), and the invoice stays unpaid on-chain.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { launchRabby, unlockRabby, enableRabbyTestnets, waitForRabbyPopup } from "./rabby-driver.js";

function env(f: string){const o:Record<string,string>={};for(const l of readFileSync(f,"utf8").split(/\r?\n/)){if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;o[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
const local = env(path.resolve(".env.local"));
const BASE = "http://localhost:3000";
const INV = process.env.QA_INVOICE_ID!;
const shots = path.resolve("e2e/.qa-shots"); mkdirSync(shots,{recursive:true});
let n=0; const log=(...a:unknown[])=>console.log(`[rej ${++n}]`,...a);

const { context, extId } = await launchRabby({ profileDir: path.resolve("e2e/.rabby-profile-buyer") });
const home = await context.newPage();
await home.goto(`chrome-extension://${extId}/index.html`,{waitUntil:"domcontentloaded"}).catch(()=>{});
await home.waitForTimeout(2000); await unlockRabby(home); await enableRabbyTestnets(home,extId).catch(()=>{}); await home.close().catch(()=>{});

const page = await context.newPage();
await page.goto(`${BASE}/i/${INV}`,{waitUntil:"networkidle",timeout:60000});
await page.waitForTimeout(2000);

// connect (reload-autoconnect pattern)
async function clickIf(rx: RegExp, t=5000){ const b=page.locator("button",{hasText:rx}).first(); if(await b.isVisible({timeout:t}).catch(()=>false)){ await b.click(); return true;} return false; }
if (await clickIf(/Connect wallet/i)) { const pop=await waitForRabbyPopup(context,extId,new Set(),15000).catch(()=>null); if(pop){await unlockRabby(pop).catch(()=>{}); const {confirmRabbyPopup}=await import("./rabby-driver.js"); await confirmRabbyPopup(pop,{timeoutMs:25000}).catch(()=>{});} }
await page.waitForTimeout(2000);
if(/Opening wallet|Connect wallet/i.test(await page.evaluate(()=>document.body.innerText).catch(()=>""))){ await page.reload({waitUntil:"networkidle"}).catch(()=>{}); await page.waitForTimeout(3000); }
await clickIf(/Switch to Arc|Switch network/i,4000) && await (async()=>{const pop=await waitForRabbyPopup(context,extId,new Set(),12000).catch(()=>null); if(pop){const {confirmRabbyPopup}=await import("./rabby-driver.js"); await confirmRabbyPopup(pop,{timeoutMs:25000}).catch(()=>{});}})();
await page.waitForTimeout(1500);
log("connected state:", (await page.evaluate(()=>document.body.innerText).catch(()=>"")).replace(/\s+/g," ").slice(0,120));

// click Pay → first popup is the EIP-712 acceptance sign → REJECT it
await page.mouse.wheel(0, 1200).catch(()=>{});
await page.waitForTimeout(1500);
log("buttons on page:", JSON.stringify(await page.locator("button").allTextContents().catch(()=>[])));
const known = new Set(context.pages());
const payBtns = page.locator("button",{hasText:/Pay invoice in USDC/i});
let paid = false;
const cnt = await payBtns.count();
for (let i=0;i<cnt;i++){ const b=payBtns.nth(i); if(await b.isVisible().catch(()=>false)){ await b.scrollIntoViewIfNeeded().catch(()=>{}); await b.click().catch((e)=>log("pay click err",e.message)); paid=true; break; } }
log("clicked Pay (visible):", paid);
const pop = await waitForRabbyPopup(context, extId, known, 18000).catch(()=>null);
if (!pop) { log("no sign popup appeared (cannot test rejection)"); }
else {
  await unlockRabby(pop).catch(()=>{});
  await pop.waitForTimeout(1500);
  // click Reject / Cancel instead of Sign
  let rejected=false;
  for (const rx of [/^Reject$/i,/^Cancel$/i,/^Reject all$/i,/^Decline$/i]) {
    const rb = pop.locator("button",{hasText:rx}).first();
    if (await rb.isVisible({timeout:1500}).catch(()=>false)) { await rb.click({force:true}).catch(()=>{}); rejected=true; log("clicked",rx.source); break; }
  }
  if(!rejected) log("no Reject button found on popup; popup buttons:", JSON.stringify(await pop.locator("button").allTextContents().catch(()=>[])));
  await page.waitForTimeout(3500);
}
// verify graceful handling
const body = (await page.evaluate(()=>document.body.innerText).catch(()=>"")).replace(/\s+/g," ");
log("app after reject — calm error present:", /cancel|reject|declin|try again|didn.t|not submitted|failed/i.test(body));
log("Pay still available (recoverable):", /Pay invoice in USDC|Pay \$|Try again/i.test(body));
log("body snippet:", body.slice(0,260));
await page.screenshot({path:path.join(shots,"reject-after.png"),fullPage:true}).catch(()=>{});
// on-chain: invoice must remain CREATED (status 1), not PAID
const { createPublicClient, http, parseAbi } = await import("viem");
const ARC={id:5042002,name:"Arc",nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},rpcUrls:{default:{http:[local.NEXT_PUBLIC_ARC_TESTNET_RPC_URL||"https://rpc.testnet.arc.network"]}}} as const;
const pub=createPublicClient({chain:ARC,transport:http()});
const ESC=parseAbi(["function invoices(bytes32) view returns (address,address,uint256,uint64,uint64,address,bytes32,bytes32,bytes32,uint8)"]);
const oc=await pub.readContract({address:local.NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS as `0x${string}`,abi:ESC,functionName:"invoices",args:[INV as `0x${string}`]}).catch(()=>null);
log("on-chain status after reject:", oc?Number(oc[9]):"n/a", "(1=CREATED expected — NOT paid)");
await context.close(); process.exit(0);
