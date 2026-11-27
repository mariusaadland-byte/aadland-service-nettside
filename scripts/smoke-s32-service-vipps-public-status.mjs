import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("app/api/vipps/payment-status/route.js","utf8").replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"");
const env={VERCEL_ENV:"production"};
let status="pending",blocked=false,receipt=0,refund=0,provider=0,sync=0,keys=[],refs=[];
const target={id:"order-id",order_number:"ORDER-1234",payment_reference:"VIPPS-1234",payment_provider:"vipps"};
const s={from(){return {select(){return this},or(){return this},limit(){return this},async maybeSingle(){return {data:{...target,payment_status:status}}}}}};
const NextResponse={json:(body,options={})=>({body,status:options.status||200,headers:options.headers||{}})};
const GET=new Function("NextResponse","db","vippsUnitReadiness","getVippsPayment","syncVippsPaymentSnapshot","rateLimitRequest","rateLimitValue","sendVippsPaymentReceiptIfNeeded","sendVippsRefundNoticeIfNeeded","process",source+";return GET;")(
 NextResponse,()=>s,async()=>({ready:true}),async(unit,ref)=>{provider++;refs.push(ref);return {}},async()=>{sync++;return {db:{status:"paid"}}},async()=>null,async(key,options)=>{assert.equal(options.requireExplicitAllowance,true);keys.push(key);return blocked?{}:null},async()=>{receipt++},async()=>{refund++},{env});
const request=(unit="service",ref="ORDER-1234",refresh=false)=>({url:"https://example.test/api/vipps/payment-status?unit="+unit+"&reference="+ref+(refresh?"&refresh=1":"")});
assert.equal((await GET(request())).body.status,"pending");
assert.equal(provider,0);assert.equal(refund,0);
assert.equal((await GET(request("service","ORDER-1234",true))).body.status,"paid");
assert.deepEqual(refs,["VIPPS-1234"]);assert.deepEqual(keys,["order-id"]);assert.equal(sync,1);
blocked=true;
assert.equal((await GET(request("service","VIPPS-1234",true))).body.status,"pending");
assert.deepEqual(keys,["order-id","order-id"]);assert.equal(provider,1);
status="paid";
for(let i=0;i<5;i++)assert.equal((await GET(request("service","ORDER-1234",true))).body.status,"paid");
assert.equal(receipt,0);assert.equal(refund,0);assert.equal(provider,1);
status="refunded";await GET(request());assert.equal(refund,0);
status="paid";await GET(request("rental"));assert.equal(receipt,1);assert.equal(refund,1);
status="pending";blocked=false;env.VERCEL_ENV="preview";await GET(request("service","ORDER-1234",true));assert.equal(provider,1);assert.equal(sync,1);
console.log("S32 Service status mail isolation and refresh limits passed");

assert.equal((await GET(request())).headers["Cache-Control"],"private, no-store");
// Exercise the actual opt-in strict limiter against malformed RPC responses.
const limitSource=readFileSync("lib/rateLimit.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
let responseData=null;
const fakeCrypto={createHmac(){return {update(){return this},digest(){return "synthetic-key"}}}};
const limiter=new Function("crypto","NextResponse","db","process",limitSource+";return rateLimitValue;")(fakeCrypto,NextResponse,()=>({rpc:async()=>({data:responseData,error:null})}),{env:{SESSION_SECRET:"synthetic"}});
const options={scope:"vipps-service-public-refresh",max:1,windowSeconds:10,requireExplicitAllowance:true};
for(const invalid of [null,{}, {allowed:"true"},{allowed:1}]){responseData=invalid;assert.equal((await limiter("test-order",options)).status,503);}
responseData={allowed:false,retry_after:10};assert.equal((await limiter("test-order",options)).status,429);
responseData={allowed:true};assert.equal(await limiter("test-order",options),null);
console.log("S32: only explicit allowance permits Service refresh, status is no-store.");
