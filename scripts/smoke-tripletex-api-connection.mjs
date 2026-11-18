import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const strip=src=>src.replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const apiSource=read("lib/tripletexApi.js");
const {tripletexEnvironment,tripletexOpenSession,tripletexRead,tripletexCheckConnection,TripletexApiError}=
 new Function("Buffer","AbortSignal",strip(apiSource)+
 ";return {tripletexEnvironment,tripletexOpenSession,tripletexRead,tripletexCheckConnection,TripletexApiError};")(Buffer,AbortSignal);
const token="eyJ0ZXN0IjoiZmFrZS1qd3QifQ.eyJ0ZXN0Ijoib25seSJ9.test-signature-never-real";
const goodSession="fake-session-token-12345";
const seen=[];
let breakAuth=false;
const fetcher=async(url,init)=>{
 seen.push({url,method:init.method,headers:init.headers,body:init.body});
 if(url.includes("/token/session/:createFromRefreshToken")){
  assert.equal(init.method,"POST");
  assert.equal(JSON.parse(init.body).refreshToken,token);
  assert.equal(JSON.parse(init.body).ttlSeconds,900);
  return Response.json({value:{token:goodSession}});
 }
 assert.ok(init.headers.Authorization?.startsWith("Basic "));
 assert.equal(Buffer.from(init.headers.Authorization.slice(6),"base64").toString(),
 "0:"+goodSession);
 if(breakAuth)return Response.json({message:"Token invalid"},{status:401});
 if(url.includes("whoAmI"))return Response.json({value:{employeeId:123}});
 if(url.includes("/customer"))return Response.json({values:[]});
 if(url.includes("/invoice/paymentType"))return Response.json({values:[]});
 if(url.includes("/ledger/vatType"))return Response.json({values:[]});
 if(url.includes("/invoice"))return Response.json({values:[]});
 return Response.json({},{status:404});
};
assert.equal(tripletexEnvironment("production"),"production");
assert.equal(tripletexEnvironment("test"),"test");
assert.equal(tripletexEnvironment("http://evil.invalid"),null);
assert.equal(tripletexEnvironment(undefined),null);
let session=await tripletexOpenSession(token,"production",{fetcher});
assert.equal(session,goodSession);
const checked=await tripletexCheckConnection(token,"production",{fetcher});
assert.equal(checked.connected,true);
assert.equal(checked.readyForInvoiceMapping,true);
assert.equal(checked.environment,"production");
assert.ok(seen.every(x=>x.url.startsWith("https://tripletex.no/v2/")));
assert.ok(!JSON.stringify(checked).includes(token));
assert.equal(seen.filter(x=>x.url.includes("session/:createFromRefreshToken")).length,2);
await tripletexOpenSession(token,"test",{fetcher:async(url,opts)=>{
 assert.ok(url.startsWith("https://api-test.tripletex.tech/v2/"));
 return Response.json({token:goodSession});
}});
await assert.rejects(()=>tripletexRead("https://evil.invalid",goodSession,"production",{fetcher}),/Ugyldig/);
await assert.rejects(()=>tripletexRead("//evil",goodSession,"production",{fetcher}),/Ugyldig/);
await assert.rejects(()=>tripletexRead("/invoice",goodSession,"http://evil.invalid",{fetcher}),/Ugyldig/);
breakAuth=true;
await assert.rejects(()=>tripletexRead("/invoice",goodSession,"production",{fetcher}),e=>
 e instanceof TripletexApiError&&e.status===401&&!String(e.message).includes(token));
breakAuth=false;

const keys=strip(read("lib/tripletexCredentials.js"));
process.env.SESSION_SECRET="fake-testing-secret-do-not-use-in-prod-1234567890";
const {protectTripletexToken,unprotectTripletexToken,storedTripletexConnection}=
 new Function("crypto","Buffer","process",keys+
 ";return {protectTripletexToken,unprotectTripletexToken,storedTripletexConnection};")(crypto,Buffer,process);
const sealed=protectTripletexToken(token);
assert.ok(sealed.ciphertext&&!sealed.ciphertext.includes(token));
assert.equal(unprotectTripletexToken(sealed),token);
assert.notEqual(protectTripletexToken(token).ciphertext,sealed.ciphertext);
assert.throws(()=>unprotectTripletexToken({...sealed,tag:Buffer.alloc(16,1).toString("base64")}));
const saved={id:"primary",environment:"production",verified_at:"2026-11-18T20:00:00Z",...sealed};
const mockStore={
 current:null,
 from(table){
  assert.equal(table,"tripletex_api_connections");
  const self=this;
  return {
   select(){return this},
   eq(){return this},
   async maybeSingle(){return {data:self.current,error:null}},
   upsert(value){self.current=value;return this},
   async single(){return {data:self.current,error:null}},
   update(value){Object.assign(self.current,value);return this},
   delete(){self.current=null;return this},
   then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject)}
  };
 }
};
const connection=read("app/api/admin/tripletex/connection/route.js");
assert.ok(connection.includes("sameOriginGuard(req)"),"Require CSRF defense");
assert.ok(connection.includes('user?.role!=="owner"'),"Owner only");
assert.ok(connection.includes('process.env.VERCEL_ENV!=="production"'),"No mutation on previews");
assert.ok(connection.includes("protectTripletexToken(refreshToken)"));
assert.ok(connection.includes("tripletexCheckConnection(refreshToken,environment)"),
 "Verify remote token before storing");
assert.ok(!connection.includes('refreshToken:refreshToken'),"Never echo raw token");
const normalize=code=>code.replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const routeFns=new Function("NextResponse","getAdminUser","db","sameOriginGuard",
 "tripletexCheckConnection","tripletexEnvironment","protectTripletexToken",
 "unprotectTripletexToken","storedTripletexConnection","process",
 normalize(connection)+";return {GET,POST};")(
 {json:(v,init)=>Response.json(v,init)},async()=>({role:who}),
 ()=>mockStore,()=>originOk?null:Response.json({error:"Origin"},{status:403}),
 async(candidate,env)=>({connected:true,environment:env,access:{customer:true,invoices:true,
  paymentTypes:true,vatTypes:true},readyForInvoiceMapping:true}),
 tripletexEnvironment,protectTripletexToken,unprotectTripletexToken,
 storedTripletexConnection,{env:{get VERCEL_ENV(){return isProd?"production":"preview"}}}
);
let who="owner",originOk=true,isProd=true;
const get=()=>new Request("https://example.invalid/api/admin/tripletex/connection");
const post=body=>new Request("https://example.invalid/api/admin/tripletex/connection",{
 method:"POST",headers:{Origin:"https://example.invalid","Content-Type":"application/json"},
 body:JSON.stringify(body)});
let response=await routeFns.GET(get());
assert.equal(response.status,200);
assert.equal((await response.json()).configured,false);
who="staff";assert.equal((await routeFns.GET(get())).status,403);
assert.equal((await routeFns.POST(post({action:"connect",refreshToken:token,environment:"production"}))).status,403);
who="owner";originOk=false;
assert.equal((await routeFns.POST(post({action:"connect",refreshToken:token,environment:"production"}))).status,403);
originOk=true;isProd=false;
assert.equal((await routeFns.POST(post({action:"connect",refreshToken:token,environment:"production"}))).status,403);
isProd=true;
response=await routeFns.POST(post({action:"connect",refreshToken:token,environment:"production"}));
assert.equal(response.status,200);
const output=await response.json();
assert.equal(output.configured,true);
assert.equal(output.directInvoiceTransferEnabled,false);
assert.equal(unprotectTripletexToken(mockStore.current),token);
assert.ok(!JSON.stringify(output).includes(token));
assert.ok(!JSON.stringify(output).includes(sealed.ciphertext));
response=await routeFns.GET(get());
assert.equal(response.status,200);
assert.equal((await response.json()).configured,true);
response=await routeFns.POST(post({action:"check"}));
assert.equal(response.status,200);
response=await routeFns.POST(post({action:"disconnect",confirmed:true}));
assert.equal(response.status,200);
assert.equal(mockStore.current,null);

const mappingJs=strip(read("lib/tripletexInvoiceMapping.js"));
const {findTripletexCustomer,findTripletexVatType,previewTripletexInvoice}=
 new Function(mappingJs+";return {findTripletexCustomer,findTripletexVatType,previewTripletexInvoice};")();
const customer={organizationNumber:"999 888 777",name:"Kunde AS",email:"billing@example.invalid"};
const customerMatches=[{id:42,organizationNumber:"999888777",name:"Kunde AS"}];
const vatTypes=[{id:123,number:3,typeOfVat:"OUTGOING"},
 {id:124,number:31,typeOfVat:"OUTGOING"},{id:125,number:33,typeOfVat:"OUTGOING"}];
assert.equal(findTripletexCustomer(customer,customerMatches).id,42);
assert.equal(findTripletexCustomer(customer,[...customerMatches,...customerMatches]).id,null);
assert.equal(findTripletexVatType(25,vatTypes).id,123);
assert.equal(findTripletexVatType(0,vatTypes).id,null);
const item={state:"paid",payment:{paid:25000,gross:25000},
 invoice:{invoice_number:"AS-2026-0001",issued_date:"2026-10-13",due_date:"2026-11-14",
 customer,line_items:[{description:"Arbeid",quantity:2,unitPriceOre:10000,vatRate:25}]}};
const preview=previewTripletexInvoice(item,customerMatches,vatTypes);
assert.equal(preview.ready,true);
assert.equal(preview.customerId,42);
assert.equal(preview.needsPaymentMapping,true);
assert.deepEqual(preview.body.orders[0].orderLines[0].vatType,{id:123});
assert.equal(preview.body.orders[0].orderLines[0].unitPriceExcludingVatCurrency,100);
assert.equal(preview.body.orders[0].isPrioritizeAmountsIncludingVat,false);
assert.ok(preview.body.orders[0].orderLines[0].description.includes("AS-2026-0001"));
assert.equal(previewTripletexInvoice(item,[],vatTypes).ready,false);
assert.equal(previewTripletexInvoice(item,customerMatches,[]).ready,false);
assert.equal(previewTripletexInvoice({...item,state:"review"},customerMatches,vatTypes).ready,false);
assert.equal(previewTripletexInvoice({...item,invoice:{...item.invoice,line_items:[{...item.invoice.line_items[0],vatRate:0}]}},customerMatches,vatTypes).ready,false);
assert.ok(!read("app/api/admin/tripletex/preview/route.js").includes('method:"POST",body:'),
 "Preview must never call write endpoints at Tripletex");
const ui=read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js");
assert.ok(ui.includes('type="password"'));
assert.ok(ui.includes("Koble til og test Tripletex"));
assert.ok(ui.includes("Kontroller fakturakoblingen"));
assert.ok(ui.includes("Dette er bare lesing fra Tripletex"));
assert.ok(read("app/admin/faktura/mva/tripletex/page.js").includes("<TripletexApiConnectClient/>"));
assert.ok(read("app/admin/regnskap/AccountingOverviewClient.js").includes("<TripletexApiConnectClient/>"));
const migration=read("supabase/migrations/20261118230500_tripletex_api_connections.sql");
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("revoke all"));
assert.ok(migration.includes("grant select,insert,update,delete"));
console.log("Tripletex API-tilkobling bestått: JWT-utveksling, host allowlist, kryptering, autorisasjon, CSRF, lese-sjekk, riktig kunde og MVA, feil-/duplikatsperre og ingen direkte bokføring.");
