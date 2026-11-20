import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const src=read("lib/externalInvoiceTransferReadiness.js").replace(/^export /gm,"");
const {externalInvoiceTransferBlockers}=new Function(src+";return {externalInvoiceTransferBlockers};")();
const ready={
 loading:false,directLoading:false,customerStatus:"linked_to_tripletex",
 direct:{configured:true,paymentTypes:[{id:88,name:"Bank"}]},
 importAmountsMatch:true,readerStatus:"calculated",
 confirmed:true,customerConfirmed:true,notImported:true,
 accountingPeriodConfirmed:true,number:"90000000",paid:true,
 paidOn:"2026-09-28",paymentTypeId:"88",paymentSourceConfirmed:true
};
assert.deepEqual(externalInvoiceTransferBlockers(ready),[],
 "A complete owner-reviewed transfer must have no hidden disabled condition");
const notLinked=externalInvoiceTransferBlockers({
 ...ready,customerStatus:"not_linked_to_tripletex"
});
assert.equal(notLinked.length,1);
assert.match(notLinked[0],/Koble kundekortet til Tripletex/);
const missingLocal=externalInvoiceTransferBlockers({
 ...ready,customerStatus:"missing_local_card"
});
assert.equal(missingLocal.length,1);
assert.match(missingLocal[0],/Kundekort – velg eller opprett/);
assert.ok(externalInvoiceTransferBlockers({
 ...ready,customerStatus:"needs_review"
}).some(x=>x.includes("kontrolleres")));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,paymentTypeId:""
}).some(x=>x.includes("betalingsmåte")));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,direct:{configured:true,paymentTypes:[],paymentTypesError:"Tripletex-testfeil"}
}).includes("Tripletex-testfeil"));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,accountingPeriodConfirmed:false
}).some(x=>x.includes("omsetning og MVA")));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,confirmed:false,customerConfirmed:false,notImported:false
}).length>=3);
assert.ok(externalInvoiceTransferBlockers({
 ...ready,importAmountsMatch:false
}).some(x=>x.includes("MVA")));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,directLoading:true
}).some(x=>x.includes("Vent")));
assert.ok(externalInvoiceTransferBlockers({
 ...ready,direct:null
}).some(x=>x.includes("Tripletex-tilkoblingen")));
assert.equal(externalInvoiceTransferBlockers({...ready,paid:false,
 paidOn:null,paymentTypeId:"",paymentSourceConfirmed:false}).length,0,
 "Unpaid invoices require no payment method or source confirmation");
const ui=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
for(const key of [
 "externalInvoiceTransferBlockers","transferSteps.length",
 "setShowTransferSteps(true)","linkCustomerNow",
 '"Koble kunde til Tripletex"',
 '"/api/admin/tripletex/customers"',
 'action:"transfer",sourceType:"contact",sourceId:linkedContactId',
 "Kundekort – velg eller opprett",
 "Ingenting sendes før alle kontroller er godkjent",
 "status","Overfør faktura + registrer lagret betaling automatisk"
])assert.ok(ui.includes(key),"Missing actionable transfer UX: "+key);
assert.ok(ui.includes("if(transferSteps.length)"));
const start=ui.indexOf('className="externalTripletexPrimaryButton"\n     style={buttons}\n     disabled={busy}');
assert.ok(start>0,"Main transfer button must not be grayed out for an unexplained missing checkbox");
assert.ok(ui.includes('if(!window.confirm("Koble fakturaens eksisterende kundekort'),
 "Customer linking must always require owner confirmation");
assert.ok(ui.includes('if(!response.ok||!data.ok)throw Error'),
 "A failed customer-link attempt must show a real error");
const api=read("app/api/admin/invoices/external-register/tripletex/route.js");
assert.ok(api.includes("linkedContactId:local.data?.contact_id||null"));
assert.ok(api.includes('owner?.role!=="owner"'));
const directApi=read("app/api/admin/invoices/external-register/tripletex/direct/route.js");
assert.ok(directApi.includes("notBookedElsewhere"));
assert.ok(directApi.includes("accountingPeriodConfirmed"));
assert.ok(directApi.includes('status:"processing"'));
assert.ok(directApi.includes("tripletexCreateUnsentedInvoice"));
console.log("Tripletex overfør-knapp: alltid mulig å få forklaring, faktisk manglende kundekobling, kontroller og eksisterende sikkerhetskrav bestått.");
