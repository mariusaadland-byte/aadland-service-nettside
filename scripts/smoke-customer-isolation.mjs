import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("app/api/customer/me/route.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
let customer={id:"customer-a",email:"a@example.invalid"};const tokens=[];
const tables={
 orders:[{id:"order-a",order_type:"custom",customer_user_id:"customer-a",items:[]},{id:"order-stale",order_type:"custom",customer_user_id:"customer-a",items:[]},{id:"order-b",order_type:"custom",customer_user_id:"customer-b",items:[]}],
 rental_bookings:[{id:"rental-a",customer_user_id:"customer-a"},{id:"rental-b",customer_user_id:"customer-b"}],
 quotes:[
  {id:"quote-a",status:"accepted",converted_order_id:"order-a",customer:{email:"a@example.invalid"}},
  {id:"quote-b",status:"accepted",converted_order_id:"order-stale",customer:{email:"b@example.invalid"}},
  {id:"draft-a",status:"draft",customer:{email:"a@example.invalid"}}
 ],
 project_drawings:[{id:"drawing-a",customer_user_id:"customer-a",customer_visible:true},{id:"hidden-a",customer_user_id:"customer-a",customer_visible:false},{id:"drawing-b",customer_user_id:"customer-b",customer_visible:true}],
 quote_drawing_publications:[{id:"publication-a",drawing_id:"published-a",customer_email:"a@example.invalid"},{id:"publication-b",drawing_id:"published-b",customer_email:"b@example.invalid"}]
};
let queries=0;
const db={from(table){queries++;let filters=[],updating=false;const chain={
 select(){return chain},update(){updating=true;return chain},order(){return chain},limit(){return chain},
 eq:(key,value)=>{filters.push(row=>row[key]===value);return chain},
 is:(key,value)=>{filters.push(row=>row[key]==value);return chain},
 in:(key,values)=>{filters.push(row=>values.includes(row[key]));return chain},
 contains:(key,value)=>{filters.push(row=>Object.entries(value).every(([k,v])=>row[key]?.[k]===v));return chain},
 then(resolve){resolve({data:updating?[]:(tables[table]||[]).filter(row=>filters.every(test=>test(row))),error:null});}
 };return chain;}};
const GET=new Function("NextResponse","getCustomer","db","createQuoteToken","safeHttpsUrl",source+"return GET;")({json:(body,options={})=>({body,status:options.status||200,headers:options.headers||{}})},async()=>customer,()=>db,quote=>{tokens.push(quote.id);return "test-token"},()=>null);
const result=await GET();assert.equal(result.status,200);
assert.deepEqual(result.body.orders.map(o=>o.id),["order-a","order-stale"]);
assert.deepEqual(result.body.rentals.map(r=>r.id),["rental-a"]);
assert.deepEqual(result.body.quotes.map(q=>q.id),["quote-a"]);
assert.equal(result.body.orders[0].source_quote.id,"quote-a");
assert.equal(result.body.orders[1].source_quote,null,"An owned order cannot grant access to another customer's quote");
assert.deepEqual(result.body.drawings.map(d=>d.id),["drawing-a","published-a"]);
assert.ok(tokens.every(id=>id==="quote-a"),"Foreign quotes and unsent drafts must never receive access tokens");
assert.match(result.headers["Cache-Control"],/private.*no-store/);
customer=null;assert.equal((await GET()).status,401);
customer={id:"customer-a",email:""};queries=0;assert.equal((await GET()).status,403);assert.equal(queries,0);
console.log("Kundeavgrensning bestått: egne tilbud/oppdrag/leier/tegninger, feil kobling, skjulte kladder og privat hurtigbuffer.");
