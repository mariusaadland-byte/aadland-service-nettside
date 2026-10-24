import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
let role="owner",guard=false,preview=false,hasDb=true,failed=false,concurrent=false;
let stored={encrypted_credentials:"encrypted-sample"},writes=0,deletions=0,refreshCalls=0;
const db=()=>hasDb?{from(table){
 assert.equal(table,"systima_oauth_connections");
 const q={mode:"read",changed:null,hasCipherMatch:true,
  select(fields){
   if(q.mode==="delete"){
    deletions++;if(failed)return Promise.resolve({error:{message:"db"},data:null});
    const existed=Boolean(stored);stored=null;
    return Promise.resolve({data:existed?[{integration_key:"systima"}]:[],error:null});
   }
   return q;
  },
  eq(field,value){
   if(field==="encrypted_credentials")q.hasCipherMatch=value===stored?.encrypted_credentials;
   else {assert.equal(field,"integration_key");assert.equal(value,"systima");}
   return q;
  },
  delete(){q.mode="delete";return q;},
  update(value){q.mode="update";q.changed=value;return q;},
  async maybeSingle(){
   if(failed)return {error:{message:"db"},data:null};
   if(q.mode==="update"){
    if(concurrent||!q.hasCipherMatch||!stored)return {error:null,data:null};
    writes++;stored={...stored,...q.changed};
    return {data:{integration_key:"systima"},error:null};
   }
   return {data:stored,error:null};
  }
 };return q;
}}:null;
const NextResponse={json:(data,{status=200,headers={}}={})=>({
 status,body:data,headers,cookies:{set(name,value,config){
 assert.equal(name,"aadland_systima_oauth_state");
 assert.equal(value,"");assert.equal(config.maxAge,0);
 }}
})};
const raw=readFileSync("app/api/admin/systima/credentials/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard",
 "refreshSystimaTokens","process",raw+";return POST;")(
 NextResponse,async()=>({role,id:"owner-test-id"}),db,
 ()=>guard?{status:403}:null,
 async old=>{
  refreshCalls++;assert.equal(old,"encrypted-sample");
  return {encrypted:"encrypted-updated",health:{status:"token_stored"}};
 },{env:{get VERCEL_ENV(){return preview?"preview":"production";}}}
);
const send=(action,extra={})=>POST({json:async()=>({action,confirmed:true,...extra})});
let r=await send("refresh");
assert.equal(r.status,200);assert.equal(writes,1);
assert.equal(refreshCalls,1);
assert.equal(stored.encrypted_credentials,"encrypted-updated");
assert.equal(r.body.tokenHealth.status,"token_stored");
assert.equal(JSON.stringify(r.body).includes("encrypted-updated"),false);
stored={encrypted_credentials:"encrypted-sample"};
concurrent=true;
r=await send("refresh");
assert.equal(r.status,409,"Concurrent disconnect/reconnect must not replace newer state");
assert.equal(writes,1);
concurrent=false;
r=await send("disconnect");
assert.equal(r.status,200);assert.equal(deletions,1);
assert.equal(stored,null);
r=await send("refresh");assert.equal(r.status,404);
r=await send("disconnect");assert.equal(r.status,200);
assert.equal(r.body.wasConnected,false);
assert.equal(deletions,2);
role="staff";
r=await send("disconnect");assert.equal(r.status,403);
role="owner";guard=true;
r=await send("disconnect");assert.equal(r.status,403);
guard=false;preview=true;
r=await send("disconnect");assert.equal(r.status,403);
preview=false;
r=await send("refresh",{confirmed:false});assert.equal(r.status,400);
r=await send("wrong");assert.equal(r.status,400);
hasDb=false;r=await send("disconnect");assert.equal(r.status,503);
hasDb=true;failed=true;
r=await send("disconnect");assert.equal(r.status,503);
failed=false;
assert.equal(writes,1);
assert.equal(refreshCalls,2);
const api=readFileSync("app/api/admin/systima/route.js","utf8");
const migration=readFileSync("supabase/migrations/20261025120000_systima_credential_disconnect.sql","utf8");
assert.ok(api.includes("systimaPublicTokenHealth"));
assert.ok(api.includes('select("authorized_at,connection_state,updated_at,encrypted_credentials")'));
assert.ok(migration.includes("grant delete"));
assert.ok(!api.includes("encrypted_credentials:"));
console.log("Systima tilgangsstyring bestått: eier, koble fra, CAS-fornying, preview-sperre og ingen tokenlekkasje.");
