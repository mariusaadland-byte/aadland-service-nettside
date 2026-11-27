import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import path from "node:path";
const read=p=>readFileSync(p,"utf8");
const gateway=read("lib/safeResend.js");
assert.ok(gateway.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(gateway.includes("S31_EMAIL_BLOCKED_OUTSIDE_PRODUCTION"));
const gatewaySource=gateway.replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
let initialized=0;
class FakeOfficialResend{
 constructor(key){initialized++;this.key=key;this.emails={send:async()=>({data:{id:"synthetic-only"}})};}
}
function client(env,key){
 const process={env};
 const make=new Function("OfficialResend","process",
  gatewaySource+";return {Resend,assertLiveEmailEnvironment};")(FakeOfficialResend,process);
 return new make.Resend(key);
}
for(const env of [
 {VERCEL_ENV:"preview",RESEND_API_KEY:"real-production-key"},
 {VERCEL_ENV:"development",RESEND_API_KEY:"real-production-key"},
 {NODE_ENV:"production",RESEND_API_KEY:"real-production-key"},
 {}
])assert.throws(()=>client(env,"real-production-key"),/S31_EMAIL_BLOCKED_OUTSIDE_PRODUCTION/);
assert.equal(initialized,0,"Preview and local env must not construct Resend SDK even with production keys");
assert.throws(()=>client({VERCEL_ENV:"production"},""),/S31_RESEND_API_KEY_MISSING/);
assert.equal(initialized,0);
assert.equal(client({VERCEL_ENV:"production"},"synthetic-key").key,"synthetic-key");
assert.equal(initialized,1);

function sources(directory){
 return readdirSync(directory,{withFileTypes:true}).flatMap(item=>{
  const full=path.join(directory,item.name);
  if(item.isDirectory())return sources(full);
  return /\.(js|jsx|mjs|cjs|ts|tsx|cts|mts)$/.test(item.name)?[full.replaceAll("\\","/")]:[];
 });
}
// Cover additional application directories and root entry points if introduced.
const application=[...["app","lib","src","pages","components"].filter(existsSync).flatMap(sources),
 ...readdirSync(".",{withFileTypes:true}).filter(item=>item.isFile()&&/\.(js|jsx|mjs|cjs|ts|tsx|cts|mts)$/.test(item.name)).map(item=>item.name)
].filter(f=>f!=="lib/safeResend.js");
const rawResendImport=/\b(?:from\s*["']resend(?:\/[^"']*)?["']|import\s*["']resend(?:\/[^"']*)?["']|(?:import|require)\s*\(\s*["']resend(?:\/[^"']*)?["'])/;
for(const sample of ['import "resend";','export {Resend} from "resend";','require ("resend")','import ("resend/subpath")',"import {Resend} from 'resend'"])
 assert.ok(rawResendImport.test(sample),"Missed unsafe SDK import: "+sample);
assert.ok(!rawResendImport.test('import {Resend} from "./safeResend";'));
let imports=0;
for(const file of application){
 const s=read(file);
 assert.ok(!rawResendImport.test(s),"S31 unguarded Resend import in "+file);
 assert.ok(!s.includes("api.resend.com"),"S31 direct Resend provider request in "+file);
 if(/safeResend/.test(s))imports++;
}
assert.ok(imports>=35,"Expected to protect all direct email sender modules, found "+imports);
const keys=read("lib/rentalEmailConfig.js");
assert.ok(keys.includes('if(process.env.VERCEL_ENV!=="production")return "";'));
for(const route of ["app/api/admin/test-receipt/route.js","app/api/admin/test-rental-receipt/route.js"])
 assert.ok(read(route).includes('S-31: Testmiljøet sender ikke e-post.'),"Explicit block missing in "+route);
for(const path of application){
 const source=read(path);
 assert.ok(!/RESEND_PREVIEW_API_KEY\s*\|\|\s*process\.env\.RESEND_API_KEY/.test(source),
  "Preview can fall back to production API key: "+path);
}
console.log("S-31 bestått: preview og lokal utvikling avviser selv ekte produksjonsnøkler, "+imports+" sendere er samlet bak sperren, prod-only SDK virker, begge testkvitteringer er blokkert.");
