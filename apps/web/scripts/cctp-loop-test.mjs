// Full product loop: real Base burn → POST /api/cctp/payin → daemon settles.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, encodeAbiParameters, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const BASE={id:84532,name:"Base Sepolia",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:["https://sepolia.base.org"]}}};
const TM="0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", MT="0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const BASE_USDC="0x036CbD53842c5426634e7929541eC2318f3dCF7e", OPERATOR="0xAD578be3836eDa982e18600784c414cC69B4EB94";
const INVOICE="0x1112f224be1689f2d056b90acdea3172cbe7c958327a95bc5809347cf7537fb5", VENDOR="0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677", AMOUNT=1_000_000n;
const TM_ABI=parseAbi(["function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32) returns (uint64)"]);
const ERC20=parseAbi(["function approve(address,uint256) returns (bool)","function allowance(address,address) view returns (uint256)"]);
function env(f){const o={};for(const l of readFileSync(f,"utf8").split(/\r?\n/)){if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;o[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
const w=env(resolve("e2e/wallets/.env.test-wallets")); const raw=w.CUSTOMER_TEST_PRIVATE_KEY;
const buyer=privateKeyToAccount(raw.startsWith("0x")?raw:"0x"+raw);
const b32=a=>encodeAbiParameters([{type:"address"}],[a]);
const pub=createPublicClient({chain:BASE,transport:http()}); const wc=createWalletClient({account:buyer,chain:BASE,transport:http()});
const al=await pub.readContract({address:BASE_USDC,abi:ERC20,functionName:"allowance",args:[buyer.address,TM]});
if(al<AMOUNT){const ah=await wc.writeContract({address:BASE_USDC,abi:ERC20,functionName:"approve",args:[TM,AMOUNT]});await pub.waitForTransactionReceipt({hash:ah});}
console.log("burning 1 USDC on Base for invoice", INVOICE.slice(0,12)+"…");
const burn=await wc.writeContract({address:TM,abi:TM_ABI,functionName:"depositForBurn",args:[AMOUNT,26,b32(VENDOR),BASE_USDC,b32(OPERATOR),AMOUNT/200n,1000]});
await pub.waitForTransactionReceipt({hash:burn});
console.log("BURN tx:", burn);
// POST to the live API (web enqueues to daemon)
const r=await fetch("http://localhost:3000/api/cctp/payin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invoiceId:INVOICE,burnTxHash:burn,sourceChain:"base"})});
console.log("POST /api/cctp/payin →", r.status, await r.text());
// poll for the DAEMON to settle it
const t0=Date.now();
for(let i=0;i<40;i++){
  const s=await (await fetch(`http://localhost:3000/api/cctp/payin?invoiceId=${INVOICE}`)).json();
  process.stdout.write(`  [${Math.round((Date.now()-t0)/1000)}s] state=${s.state} invoice=${s.invoiceStatus}\r`);
  if(s.invoiceStatus==="PAID"||s.state==="settled"){ console.log(`\n✓✓✓ DAEMON SETTLED — invoice PAID, arc mint ${s.arcTxHash}`); process.exit(0); }
  await new Promise(r=>setTimeout(r,5000));
}
console.log("\n✗ not settled in 200s");
