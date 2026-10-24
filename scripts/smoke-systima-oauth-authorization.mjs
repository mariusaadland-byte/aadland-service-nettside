import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";

const key=crypto.randomBytes(32).toString("base64");
const env={
 VERCEL_ENV:"production",SYSTIMA_OAUTH_ENABLED:"true",
 SYSTIMA_CLIENT_ID:"only-mock-client",SYSTIMA_CLIENT_SECRET:"only-mock-secret",
 SYSTIMA_TOKEN_URL:"https://api-systima.azurewebsites.net/api-external/token",
 SYSTIMA_REDIRECT_URI:"https://www.aadland-service.no/api/admin/systima/callback",
 SYSTIMA_TOKEN_ENCRYPTION_KEY:key,NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"
};
const configRaw=readFileSync("lib/systimaIntegrationStatus.js","utf8").replace(/^export /gm,"");
const {systimaSetupStatus,SYSTIMA_AUTHORIZATION_URL}=new Function(configRaw+
 ";return {systimaSetupStatus,SYSTIMA_AUTHORIZATION_URL};")();
const vaultRaw=readFileSync("lib/systimaTokenVault.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {secureSystimaSeal,secureSystimaOpen}=new Function("crypto",vaultRaw+
 ";return {secureSystimaSeal,secureSystimaOpen};")(crypto);
let role="owner",guarded=false,authState=null,writeCount=0;
let stored=null;
const s={
 from(table){
  assert.equal(table,"systima_oauth_connections");
  const q={
   payload:null,
   select(){return q;},
   eq(field,value){assert.equal(field,"integration_key");assert.equal(value,"systima");return q;},
   async maybeSingle(){return {data:stored?{
    authorized_at:"2026-10-25T00:00:00Z",connection_state:"token_obtained_no_read_endpoint"}:null,error:null}},
   upsert(v){q.payload=v;return q;},
   async single(){writeCount++;stored=q.payload;return {data:{integration_key:"systima"},error:null}}
  };return q;
 }
};
const fakeDb=()=>s;
class FakeResponse{
 static json(body,{status=200,headers={}}={}){
  return {body,status,headers,cookies:{set(...args){authState=args}}};
 }
 static redirect(url,status){
  return {url:url.toString(),status,cookies:{set(){}},headers:{set(){}}};
 }
}
const apiRaw=readFileSync("app/api/admin/systima/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const api=new Function("NextResponse","crypto","getAdminUser","db","sameOriginGuard",
 "systimaSetupStatus","SYSTIMA_AUTHORIZATION_URL","process",
 apiRaw+";return {GET,POST};")(
 FakeResponse,crypto,async()=>({role,id:"user-id"}),fakeDb,
 ()=>guarded?{status:403}:null,systimaSetupStatus,SYSTIMA_AUTHORIZATION_URL,{env}
);
let r=await api.GET();
assert.equal(r.status,200);
assert.equal(r.body.connectionAvailable,true);
assert.equal(r.body.hasAuthorization,false);
assert.equal(r.body.accessToSupplierDocuments,false);
assert.ok(!JSON.stringify(r.body).includes("only-mock-secret"));
role="staff";r=await api.GET();assert.equal(r.status,403);
role="owner";guarded=true;r=await api.POST({json:async()=>({action:"start",confirmed:true})});
assert.equal(r.status,403);
guarded=false;env.SYSTIMA_OAUTH_ENABLED="false";
r=await api.POST({json:async()=>({action:"start",confirmed:true})});
assert.equal(r.status,409);
env.SYSTIMA_OAUTH_ENABLED="true";
r=await api.POST({json:async()=>({action:"start",confirmed:false})});
assert.equal(r.status,400);
r=await api.POST({json:async()=>({action:"start",confirmed:true})});
assert.equal(r.status,200);
const approvalUrl=new URL(r.body.authorizeUrl);
assert.equal(approvalUrl.origin,"https://app.systima.no");
assert.equal(approvalUrl.searchParams.get("clientId"),"only-mock-client");
const state=approvalUrl.searchParams.get("state");
assert.match(state,/^[A-Za-z0-9_-]{43}$/);
assert.equal(authState[0],"aadland_systima_oauth_state");
assert.equal(authState[1],state+".user-id");
assert.equal(authState[2].httpOnly,true);
assert.equal(authState[2].maxAge,600);
assert.equal(writeCount,0,"Only a consenting Systima redirect may store tokens");

const callbackRaw=readFileSync("app/api/admin/systima/callback/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let outbound=0,tokenCode="";
const mockedFetch=async(url,options)=>{
 outbound++;assert.equal(url,"https://api-systima.azurewebsites.net/api-external/token");
 assert.equal(options.method,"POST");assert.equal(options.redirect,"error");
 const body=JSON.parse(options.body);
 assert.equal(body.grantType,"authorization_code");
 assert.equal(body.clientSecret,"only-mock-secret");
 assert.equal(body.redirectUri,env.SYSTIMA_REDIRECT_URI);
 tokenCode=body.code;
 return {ok:true,async json(){return {
  accessToken:"FAKE.access.token",refreshToken:"FAKE.refresh.token",expiresAt:"2026-10-25T02:00:00Z"
 }}};
};
const callback=new Function("NextResponse","crypto","getAdminUser","db","systimaSetupStatus",
 "secureSystimaSeal","process","fetch",callbackRaw+";return {GET};")(
 FakeResponse,crypto,async()=>({role,id:"user-id"}),fakeDb,
 systimaSetupStatus,secureSystimaSeal,{env},mockedFetch
);
const req=(code="mock-authorization-code",givenState=state,client="only-mock-client")=>({
 url:"https://www.aadland-service.no/api/admin/systima/callback?"+
  new URLSearchParams({state:givenState,authorizationCode:code,oauthClientId:client}),
 cookies:{get(name){assert.equal(name,"aadland_systima_oauth_state");return {value:state+".user-id"};}}
});
role="staff";
r=await callback.GET(req());
assert.ok(r.url.includes("status=denied"));assert.equal(outbound,0);
role="owner";
r=await callback.GET(req("mock-code","invalid-state"));
assert.ok(r.url.includes("invalid-state"));assert.equal(outbound,0);
r=await callback.GET(req("mock-code",state,"wrong-client"));
assert.ok(r.url.includes("invalid-callback"));assert.equal(outbound,0);
r=await callback.GET(req());
assert.equal(r.status,303);
assert.ok(r.url.includes("status=authorized"));
assert.equal(tokenCode,"mock-authorization-code");
assert.equal(outbound,1);
assert.equal(writeCount,1);
assert.equal(stored.integration_key,"systima");
assert.equal(stored.connection_state,"token_obtained_no_read_endpoint");
assert.equal(stored.authorized_by,"user-id");
assert.ok(!stored.encrypted_credentials.includes("FAKE.access"));
assert.equal(secureSystimaOpen(stored.encrypted_credentials,key).accessToken,"FAKE.access.token");
r=await api.GET();
assert.equal(r.body.hasAuthorization,true);
assert.ok(!JSON.stringify(r.body).includes("FAKE.access.token"));
assert.equal(r.body.accessToSupplierDocuments,false);
assert.equal(writeCount,1);
console.log("Systima OAuth API bestått: eier, samtykke, state, utløp, serverutveksling, kryptering og ingen bilagslesing.");
