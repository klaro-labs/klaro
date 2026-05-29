// P0-10 balance buckets: login QA vendor → /vendor overview → screenshot +
// read the balance section. Balance is a simulated model (mockComputeBalances)
// over REAL invoices, honestly labelled "Simulated session".
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
function env(f){const o={};for(const l of readFileSync(f,"utf8").split(/\r?\n/)){if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;o[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
const local=env(path.resolve(".env.local"));
const shots=path.resolve("e2e/.pb-vid"); try{rmSync(shots,{recursive:true,force:true});}catch{} mkdirSync(shots,{recursive:true});
const admin=createClient(local.SUPABASE_URL,local.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ROUTE=process.argv[2]||"/vendor";
const {data:link}=await admin.auth.admin.generateLink({type:"magiclink",email:"xprtqk@gmail.com"});
const cb=`http://localhost:3100/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(ROUTE)}`;
const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1280,height:1000}})).newPage();
await p.goto(cb,{waitUntil:"networkidle",timeout:120000}); await p.waitForTimeout(1500);
// explicit nav to the target route (auth `next` isn't always honored)
const t0=Date.now();
let resp=null, gotoErr=null;
try { resp = await p.goto("http://localhost:3100"+ROUTE,{waitUntil:"domcontentloaded",timeout:120000}); }
catch(e){ gotoErr=String(e).slice(0,80); }
console.log("goto:",ROUTE,"status:",resp?resp.status():"n/a","ms:",Date.now()-t0,"err:",gotoErr||"none");
await p.waitForTimeout(1500);
console.log("url:",p.url());
await p.screenshot({path:shots+"/vendor.png",fullPage:true});
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g," ");
const kws=["Available","Pending","Locked","Held","Simulat","cashout","Balance","Create"].filter(k=>new RegExp(k,"i").test(body));
const onVendor=!/\/signin/.test(p.url());
console.log("logged in:",onVendor);
console.log("balance/dashboard keywords:",kws.join(", "));
console.log("body:",body.slice(0,420));
try{rmSync(shots,{recursive:true,force:true});}catch{}
await b.close();
console.log("OVERVIEW_OK="+(onVendor && kws.length>=3));
process.exit(onVendor?0:1);
