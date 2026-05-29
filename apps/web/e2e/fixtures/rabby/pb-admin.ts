// P1-5 admin UI: provision an operator user (app_metadata.role=operator) →
// login → drive /admin + /admin/disputes → verify role gate passes + screens
// render (the decide/queue UI). Operator role = admin gate per app/admin/layout.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
function env(f){const o={};for(const l of readFileSync(f,"utf8").split(/\r?\n/)){if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<0)continue;o[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^"|"$/g,"");}return o;}
const local=env(path.resolve(".env.local"));
const shots=path.resolve("e2e/.pb-vid"); try{rmSync(shots,{recursive:true,force:true});}catch{} mkdirSync(shots,{recursive:true});
let n=0; const log=(...a)=>console.log(`[admin ${++n}]`,...a);
const admin=createClient(local.SUPABASE_URL,local.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const email=`qa-operator-${randomBytes(3).toString("hex")}@example.com`;
const { data: cu, error: cuErr } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { klaro_role: "operator" } });
if (cuErr) { log("createUser err:", cuErr.message); process.exit(2); }
log("operator user:", email, "role:", cu.user?.app_metadata?.role);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const cb=`http://localhost:3100/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/admin")}`;

const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1280,height:1000}})).newPage();
p.on("console",(m)=>{if(m.type()==="error")log("page-err:",m.text().slice(0,120));});
await p.goto(cb,{waitUntil:"networkidle",timeout:120000}); await p.waitForTimeout(2000);
log("after login url:",p.url());
const onAdmin = /\/admin/.test(p.url()) && !/operator_role_required|\/signin|\/vendor/.test(p.url());
const body=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g," ");
log("on /admin (role gate passed):",onAdmin,"| body:",body.slice(0,200));
await p.screenshot({path:shots+"/admin.png",fullPage:true});

// drive /admin/disputes (the decide/queue surface)
let disputesOk=false;
if(onAdmin){
  await p.goto("http://localhost:3100/admin/disputes",{waitUntil:"networkidle",timeout:60000}).catch(()=>{});
  await p.waitForTimeout(1500);
  const db=(await p.evaluate(()=>document.body.innerText).catch(()=>"")).replace(/\s+/g," ");
  disputesOk = /\/admin\/disputes/.test(p.url()) && /dispute|case|queue|decide|review|resolve|outcome|No /i.test(db);
  log("/admin/disputes renders:",disputesOk,"| body:",db.slice(0,180));
}
try{rmSync(shots,{recursive:true,force:true});}catch{}
await b.close();
console.log("ADMIN_OK="+(onAdmin && disputesOk));
process.exit(onAdmin?0:1);
