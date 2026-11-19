import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync("app/admin/kunder/[id]/page.js","utf8");
const client=readFileSync("app/admin/kunder/[id]/CustomerCardClient.js","utf8");
const api=readFileSync("app/api/admin/tripletex/customers/route.js","utf8");
assert.ok(page.includes('user.role==="owner"'),"Only owners are eligible for automatic Tripletex writes");
assert.ok(page.includes('invoice?.status==="sent"')&&page.includes('Number(invoice.paid_ore)===0'),
 "Only sent unpaid invoice contexts are eligible");
assert.ok(page.includes('invoice.customer?.contactId===id'),"Must be the invoice's own customer");
assert.ok(page.includes('linked?.status==="linked"'),"Customer must already be linked");
assert.ok(page.includes('autoSyncTripletex={autoSyncTripletex}'));
assert.ok(client.includes('if(autoSyncTripletex){'),"No auto update for other cards");
assert.ok(client.indexOf('if(!r.ok)throw')<client.indexOf('if(autoSyncTripletex){'),
 "Local save must succeed before attempting provider update");
assert.ok(client.includes('action:"update",sourceType:"contact",sourceId:contact.id'));
assert.ok(!client.includes('action:"transfer"'),"Never create duplicate Tripletex customer");
assert.ok(client.includes('Den opprinnelige fakturaen er uendret.'));
assert.ok(api.includes('tripletexUpdateCustomer(customerId,correction.payload'),
 "Server must update existing linked customer by persisted ID");
const invoiceWrite=readFileSync("app/api/admin/invoices/route.js","utf8");
assert.ok(invoiceWrite.includes('.eq("status","draft")'),"Issued invoices remain immutable");
console.log("Ubetalt kundekort autosynk bestått: eier, kundekobling, ubetalt, eksisterende kunde-ID, ingen endring av utstedt faktura.");
