import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/tripletexCustomerSync.js").replace(/^export /gm,"");
const {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload}=
 new Function(source+";return {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload};")();
const privateCustomer={name:"Ola Nordmann",email:"ola@example.no",phone:"12345678",
 address:"Veien 2, 5000 Bergen",customerType:"private",internalNote:"NEVER SHARE"};
const business={name:"Firma AS",customerType:"business",organizationNumber:"987654321"};
assert.equal(findTripletexCustomerForTransfer(privateCustomer,
 [{id:44,name:"OLA NORDMANN",email:"OLA@example.no"}]).id,44);
assert.equal(customerTransferKey(business).kind,"organizationNumber");
assert.equal(findTripletexCustomerForTransfer(business,
 [{id:45,name:"Unknown",organizationNumber:"987654321"}]).id,45);
assert.equal(findTripletexCustomerForTransfer(business,
 [{id:45,organizationNumber:"987654321"},{id:46,organizationNumber:"987654321"}]).state,"review");
assert.equal(findTripletexCustomerForTransfer(privateCustomer,[]).state,"new");
assert.equal(findTripletexCustomerForTransfer({name:"Unidentified"},[]).state,"invalid");
const payload=tripletexCustomerPayload(privateCustomer);
assert.equal(payload.name,"Ola Nordmann");
assert.equal(payload.postalAddress.postalCode,"5000");
assert.equal(JSON.stringify(payload).includes("NEVER SHARE"),false);
const api=read("app/api/admin/tripletex/customers/route.js");
assert.ok(api.includes('user?.role!=="owner"')&&api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('status:"processing"')&&api.includes('status:"needs_review"'));
assert.ok(api.indexOf('.insert({')<api.indexOf("tripletexCreateCustomer("));
assert.ok(api.includes('action==="check"'));
const client=read("app/admin/faktura/mva/tripletex/TripletexCustomerSyncClient.js");
assert.ok(client.includes("Overfør alle nye kunder")&&client.includes("Kontroller"));
assert.ok(read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js")
 .includes("<TripletexCustomerSyncClient/>"));
const sql=read("supabase/migrations/20261119003000_tripletex_customer_links.sql");
assert.ok(sql.includes("enable row level security")&&sql.includes("grant select,insert,update,delete"));
console.log("Tripletex kundeoverføring bestått: sikker nøkkel/mapping, duplikatsperre, server-autorisasjon, forsiktig POST-claim, RLS og knapper.");
