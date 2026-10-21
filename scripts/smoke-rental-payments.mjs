import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
function memoryDb(initial){
 const row={...initial};return {row,from(){let update={},filters=[];const chain={
  update(value){update=value;return chain},eq(key,value){filters.push(r=>r[key]===value);return chain},is(key,value){filters.push(r=>r[key]==value);return chain},select(){return chain},
  async maybeSingle(){if(!filters.every(f=>f(row)))return {data:null,error:null};Object.assign(row,update);return {data:{id:row.id},error:null}},
  then(resolve){chain.maybeSingle().then(resolve)}
 };return chain;}};
}
let creates=0,amounts=[],failCreate=false,existingState="CREATED";
const code=readFileSync("lib/startRentalVippsPayment.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
const startPayment=new Function("crypto","createVippsPayment","getVippsPayment","vippsUnitReadiness","syncVippsPaymentSnapshot","rentalBookingSiteUrl",code+"return startRentalVippsPayment;")(
 crypto,async input=>{creates++;amounts.push(input.amountOre);if(failCreate)throw Error("Timeout");return {redirectUrl:"https://example.invalid/pay",pspReference:"PSP-TEST"}},
 async()=>({state:existingState,redirectUrl:"https://example.invalid/pay"}),async()=>({ready:true}),async()=>({db:{status:"pending"}}),()=>"https://example.invalid"
);
const booking={id:"booking-a",booking_number:"AS-U-TEST",status:"confirmed",total_ore:12500,deposit_ore:50000,payment_status:"unpaid",payment_reference:null,payment_captured_ore:0,payment_refunded_ore:0,customer:{}};
const db=memoryDb(booking);
const replies=await Promise.all([startPayment({s:db,booking:{...booking}}),startPayment({s:db,booking:{...booking}})]);
assert.equal(creates,1,"Only one simultaneous request may start a payment");
assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.deepEqual(amounts,[12500],"Vipps must charge rental only, excluding deposit");
failCreate=true;const failedDb=memoryDb({...booking,id:"booking-b"});const fail=await startPayment({s:failedDb,booking:{...failedDb.row}});
assert.equal(fail.status,502);assert.ok(failedDb.row.payment_reference,"Keep the reference after an uncertain provider response");assert.equal(failedDb.row.payment_status,"pending");
failCreate=false;const createsBefore=creates;
const reuse=await startPayment({s:failedDb,booking:{...failedDb.row}});assert.equal(reuse.body.reused,true);assert.equal(creates,createsBefore);
assert.equal((await startPayment({s:db,booking:{...booking,payment_captured_ore:12500}})).status,409);
const admin=readFileSync("app/api/admin/rental-bookings/route.js","utf8");
const block=admin.slice(admin.indexOf(' if(action==="record-deposit-held")'),admin.indexOf(' if(action==="confirm-and-send"||'));
const deposit=new Function("NextResponse",`return async function(s,b,current){const action=b.action;${block}}`)({json:(body,options={})=>({body,status:options.status||200})});
const depositDb=memoryDb({id:"deposit-test",deposit_ore:50000,deposit_status:"not_paid",deposit_charged_ore:0,deposit_released_at:null,payment_captured_ore:12500});
let r=await deposit(depositDb,{id:"deposit-test",action:"record-deposit-held"},{...depositDb.row});assert.equal(r.status,200);
for(const amount of [-1,0,50001,1.5,Infinity,NaN]){
 assert.equal((await deposit(depositDb,{id:"deposit-test",action:"record-deposit-charge",depositChargedOre:amount},{...depositDb.row})).status,400);
}
r=await deposit(depositDb,{id:"deposit-test",action:"record-deposit-charge",depositChargedOre:15000},{...depositDb.row});assert.equal(r.status,200);
const stale={...depositDb.row};r=await deposit(depositDb,{id:"deposit-test",action:"release-deposit"},{...depositDb.row});assert.equal(r.status,200);assert.equal(depositDb.row.deposit_charged_ore,15000);
r=await deposit(depositDb,{id:"deposit-test",action:"record-deposit-charge",depositChargedOre:20000},{...depositDb.row});assert.equal(r.status,409,"A released deposit is closed");
r=await deposit(depositDb,{id:"deposit-test",action:"record-deposit-charge",depositChargedOre:20000},stale);assert.equal(r.status,409,"A stale screen must not reopen a released deposit");
assert.equal(depositDb.row.payment_captured_ore,12500,"Deposit changes must not change rental payments");
console.log("Utleiebetaling bestått: samtidige forsøk, depositum utenfor leiebeløp, bevart Vipps-referanse og avsluttet depositum.");
