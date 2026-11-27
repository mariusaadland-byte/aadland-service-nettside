import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("app/api/customer/me/route.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
let customer={id:"customer-a",email:"a@example.invalid"};
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
let queries=0,failedTable=null;
const db={from(table){queries++;let filters=[],updating=false,windowRange=null;const chain={
 select(){return chain},update(){updating=true;return chain},order(){return chain},limit(){return chain},range(start,end){windowRange=[start,end];return chain},
 eq:(key,value)=>{filters.push(row=>row[key]===value);return chain},
 is:(key,value)=>{filters.push(row=>row[key]==value);return chain},
 in:(key,values)=>{filters.push(row=>values.includes(row[key]));return chain},
 contains:(key,value)=>{filters.push(row=>Object.entries(value).every(([k,v])=>row[key]?.[k]===v));return chain},
 then(resolve){const rows=updating?[]:(tables[table]||[]).filter(row=>filters.every(test=>test(row)));resolve(table===failedTable?{data:null,count:null,error:{code:'TEST'}}:{data:windowRange?rows.slice(windowRange[0],windowRange[1]+1):rows,count:rows.length,error:null});}
 };return chain;}};
const GET=new Function("NextResponse","getCustomer","db","safeHttpsUrl",source+"return GET;")({json:(body,options={})=>({body,status:options.status||200,headers:options.headers||{}})},async()=>customer,()=>db,()=>null);
const result=await GET();assert.equal(result.status,200);
assert.deepEqual(result.body.orders.map(o=>o.id),["order-a","order-stale"]);
assert.deepEqual(result.body.rentals.map(r=>r.id),["rental-a"]);
assert.deepEqual(result.body.quotes.map(q=>q.id),["quote-a"]);
assert.equal(result.body.orders[0].source_quote.id,"quote-a");
assert.equal(result.body.orders[1].source_quote,null,"An owned order cannot grant access to another customer's quote");
assert.deepEqual(result.body.drawings.map(d=>d.id),["drawing-a","published-a"]);
assert.ok(result.body.quotes.every(q=>!q.href.includes("token=")),"Authenticated customer history never exports bearer tokens");
assert.ok(result.body.orders.every(o=>!o.source_quote||!o.source_quote.href.includes("token=")),"Order links must use the existing customer session");
assert.match(result.headers["Cache-Control"],/private.*no-store/);
customer=null;assert.equal((await GET()).status,401);
customer={id:"customer-a",email:""};queries=0;assert.equal((await GET()).status,403);assert.equal(queries,0);
console.log("Kundeavgrensning bestått: egne tilbud/oppdrag/leier/tegninger, feil kobling, skjulte kladder og privat hurtigbuffer.");

customer={id:"customer-a",email:"a@example.invalid"};
const request=(kind,page)=>({url:"https://example.invalid/api/customer/me?serviceHistory="+kind+"&page="+page});
tables.orders=Array.from({length:105},(_,i)=>({id:"a-"+i,order_type:"order",customer_user_id:"customer-a",items:[]}));
tables.orders.splice(101,0,{id:"other",order_type:"order",customer_user_id:"customer-b",items:[]});
let page1=await GET(request("orders",1)),page2=await GET(request("orders",2));
assert.equal(page1.body.orders.length,100);assert.equal(page1.body.serviceHistory.orders.total,105);assert.equal(page1.body.serviceHistory.orders.hasMore,true);
assert.equal(page2.body.orders.length,5);assert.equal(page2.body.serviceHistory.orders.hasMore,false);assert.equal(page2.body.serviceHistory.orders.loadedThrough,105);
assert.equal(new Set([...page1.body.orders,...page2.body.orders].map(x=>x.id)).size,105);
assert.ok(page2.body.orders.every(x=>x.customer_user_id==="customer-a"));
assert.equal(page2.body.rentals.length,0);
tables.quotes=Array.from({length:101},(_,i)=>({id:"qa-"+i,status:"accepted",customer:{email:"a@example.invalid"}}));
tables.quotes.push({id:"foreign",status:"accepted",customer:{email:"b@example.invalid"}},{id:"draft",status:"draft",customer:{email:"a@example.invalid"}});
page2=await GET(request("quotes",2));
assert.equal(page2.body.serviceHistory.quotes.total,101);assert.deepEqual(page2.body.quotes.map(x=>x.id),["qa-100"]);
tables.project_drawings=Array.from({length:51},(_,i)=>({id:"da-"+i,customer_user_id:"customer-a",customer_visible:true}));
tables.project_drawings.push({id:"hidden",customer_user_id:"customer-a",customer_visible:false},{id:"foreign",customer_user_id:"customer-b",customer_visible:true});
tables.quote_drawing_publications=Array.from({length:151},(_,i)=>({id:"pa-"+i,drawing_id:"shared-"+i,customer_email:"a@example.invalid"}));
tables.quote_drawing_publications.push({id:"foreign",drawing_id:"foreign",customer_email:"b@example.invalid"});
page2=await GET(request("drawings",2));
assert.equal(page2.body.serviceHistory.drawings.total,202);assert.deepEqual(page2.body.drawings.map(x=>x.id),["da-50","shared-150"]);assert.equal(page2.body.serviceHistory.drawings.hasMore,false);
assert.equal((await GET(request("orders",-1))).status,400);assert.equal((await GET(request("rentals",2))).status,400);
const ui=readFileSync("app/min-side/page.js","utf8");
assert.ok(ui.includes("historyGeneration.current")&&ui.includes("next.customer?.id!==owner")&&ui.includes("Vis eldre historikk"));
console.log("S35 pagination: 105 orders, 101 quotes, 202 drawing entries; authenticated scope preserved on page 2, no rental reads.");

failedTable="quotes";let incomplete=await GET();assert.equal(incomplete.status,200);assert.equal(incomplete.body.serviceHistory.quotes.unavailable,true);assert.equal(incomplete.body.serviceHistory.quotes.total,null);assert.equal((await GET(request("quotes",2))).status,500);
failedTable="quote_drawing_publications";incomplete=await GET();assert.equal(incomplete.status,200);assert.equal(incomplete.body.serviceHistory.drawings.unavailable,true);assert.equal(incomplete.body.serviceHistory.drawings.total,null);assert.ok(incomplete.body.drawings.length>0,"Keep available direct drawings");assert.equal((await GET(request("drawings",2))).status,503);
failedTable=null;assert.equal((await GET()).body.serviceHistory.drawings.unavailable,false);
assert.ok(ui.includes("Hele historikken kunne ikke hentes."));assert.ok(ui.includes("Historikksiden kunne ikke bekreftes."));
console.log("S35 failed history reads never appear as verified empty totals.");
