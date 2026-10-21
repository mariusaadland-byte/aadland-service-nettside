import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
const source=readFileSync("app/api/admin/quotes/convert/route.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
let user=null,rpcResult={data:{orderId:"test-order",orderNumber:"AS-TEST"},error:null},calls=[];
const POST=new Function("NextResponse","crypto","getAdminUser","db","sameOriginGuard",source+"return POST;")({json:(body,options={})=>({body,status:options.status||200})},crypto,async()=>user,()=>({rpc:async(name,args)=>{calls.push({name,args});return rpcResult;}}),()=>null);
const id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const req=body=>({json:async()=>body});
assert.equal((await POST(req({id}))).status,403);
assert.equal(calls.length,0);
user={role:"owner"};
assert.equal((await POST(req(null))).status,400);
assert.equal((await POST(req({id:"bad-id"}))).status,400);
const success=await POST(req({id}));
assert.equal(success.status,200);assert.equal(success.body.orderId,"test-order");
assert.equal(calls[0].name,"create_accepted_quote_order");assert.equal(calls[0].args.p_quote_id,id);
assert.match(calls[0].args.p_order_number,/^AS-\d{8}-[A-F0-9]{4}$/);
rpcResult={data:{orderId:"existing-order",alreadyExists:true},error:null};
const duplicate=await POST(req({id}));assert.equal(duplicate.status,409);assert.equal(duplicate.body.orderId,"existing-order");
for(const [code,status] of [["P0002",404],["22023",409],["42883",503]]){
 rpcResult={data:null,error:{code}};assert.equal((await POST(req({id}))).status,status);
}
console.log("Tilbud til oppdrag bestått: tilgang, validering, samlet oppretting, gjentatte kall og feilrespons.");
