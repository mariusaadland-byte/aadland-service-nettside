import assert from "node:assert/strict";
import {checkoutRequest,checkoutAgreementResponse,checkoutConsent} from "../lib/rentalCheckoutUi.mjs";
const id="00000000-0000-4000-8000-000000000001",quote={digest:"a".repeat(64),snapshot:{termsVersion:"2026-11-25"}},lines=[{itemId:id,startDate:"2026-12-01",endDate:"2026-12-01",quantity:1,totalOre:1}],args={quote,lines,sales:[],accepted:true,requestId:id};
const p=checkoutRequest(args);assert.ok(p);assert.equal(p.lines[0].totalOre,undefined);assert.equal(checkoutRequest({...args,accepted:false}),null);
const raw={status:"agreement_ready",groupId:id,agreementId:id,documentDigest:"b".repeat(64),quoteDigest:quote.digest,termsVersion:quote.snapshot.termsVersion,expiresAt:"2026-12-01T12:30:00Z",payableOre:30000,depositOre:50000,orderNumber:"1",documentUrl:"https://evil.invalid"};
const a=checkoutAgreementResponse(raw,p);assert.equal(a.documentUrl,"/api/customer/signing/"+id+"/avtale");assert.equal(checkoutAgreementResponse({...raw,quoteDigest:"c".repeat(64)},p),null);
assert.equal(checkoutConsent(a,"Demo Kunde",false),null);assert.equal(checkoutConsent(a,"Demo Kunde",true).documentDigest,raw.documentDigest);
console.log("U-39C checkout UI request and immutable document binding passed");
