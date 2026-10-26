import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/companyRegistryPatch.js").replace(/^export /gm,"");
const {compareCompanyRegistryCard,applyCompanyRegistryCard}=
 new Function(source+";return {compareCompanyRegistryCard,applyCompanyRegistryCard};")();
const existing={
 id:"11111111-1111-4111-8111-111111111111",updatedAt:"2026-10-26T10:00:00Z",
 name:"Gammelt AS",organizationNumber:"987654321",customerType:"business",
 email:"faktura@eksisterende.no",phone:"91234567",address:"Gammel adresse 2",
 contactPerson:"Fakturakontakt",paymentTermsDays:30,preferredPaymentMethod:"bank",
 internalNote:"Viktig kontaktinstruks"
};
const registry={name:"NYTT FIRMANAVN AS",organizationNumber:"987654321",
 address:"Gate 3\n5000 BERGEN",registeredForVat:true};
let d=compareCompanyRegistryCard(existing,registry);
assert.equal(d.companyMismatch,false);
assert.deepEqual(d.comparisons.filter(x=>x.changed).map(x=>x.key),["name","address"]);
let patched=applyCompanyRegistryCard(existing,registry,["name","address"]);
assert.equal(patched.name,"NYTT FIRMANAVN AS");
assert.equal(patched.address,"Gate 3\n5000 BERGEN");
assert.equal(patched.organizationNumber,"987654321");
assert.equal(patched.email,existing.email);
assert.equal(patched.phone,existing.phone);
assert.equal(patched.contactPerson,existing.contactPerson);
assert.equal(patched.paymentTermsDays,existing.paymentTermsDays);
assert.equal(patched.preferredPaymentMethod,existing.preferredPaymentMethod);
assert.equal(patched.internalNote,existing.internalNote);
assert.equal(patched.id,existing.id);
assert.equal(patched.updatedAt,existing.updatedAt);
assert.equal(existing.name,"Gammelt AS","Must never mutate loaded customer");
patched=applyCompanyRegistryCard(existing,registry,["name"]);
assert.equal(patched.address,"Gammel adresse 2","Unchecked field remains unchanged");
assert.equal(patched.name,"NYTT FIRMANAVN AS");
const missingAddress={...registry,address:""};
d=compareCompanyRegistryCard(existing,missingAddress);
assert.equal(d.comparisons.find(x=>x.key==="address").available,false);
assert.throws(()=>applyCompanyRegistryCard(existing,missingAddress,["address"]),/ikke en adresse/);
const different={...registry,organizationNumber:"999999999"};
assert.equal(compareCompanyRegistryCard(existing,different).companyMismatch,true);
assert.throws(()=>applyCompanyRegistryCard(existing,different,["name","address"]),/bekrefte/);
assert.throws(()=>applyCompanyRegistryCard(existing,different,["name","address"],{confirmCompanyMismatch:true}),/organisasjonsnummer/);
patched=applyCompanyRegistryCard(existing,different,["name","organizationNumber","address"],
 {confirmCompanyMismatch:true});
assert.equal(patched.organizationNumber,"999999999");
assert.equal(patched.email,existing.email);
const privateCustomer={...existing,organizationNumber:"",customerType:"private"};
patched=applyCompanyRegistryCard(privateCustomer,registry,["name","organizationNumber","address"]);
assert.equal(patched.customerType,"business");
assert.equal(patched.email,existing.email);
assert.throws(()=>compareCompanyRegistryCard(existing,{name:"X",organizationNumber:"not-an-org",address:"A"}),/gyldig/);
assert.throws(()=>applyCompanyRegistryCard(existing,registry,["email"]),/gyldige registerfelt/);
const updater=read("app/admin/kunder/[id]/CompanyRegistryCardUpdater.js");
const card=read("app/admin/kunder/[id]/CustomerCardClient.js");
const api=read("app/api/admin/customer-contacts/route.js");
assert.ok(updater.includes("<CompanyRegistrySearch"));
assert.ok(updater.includes("Kontroller før overføring"));
assert.ok(updater.includes("onApply(next)"));
assert.ok(updater.includes("IKKE lagret"));
assert.ok(updater.includes("companyMismatch")&&updater.includes("allowOtherCompany"));
assert.ok(card.includes("<CompanyRegistryCardUpdater"));
assert.ok(card.includes('method:"PATCH"'));
assert.ok(api.includes("update_invoice_customer_card_v2"));
assert.ok(api.includes("p_expected_updated_at:body.updatedAt"),"Preserve optimistic locking for edits");
console.log("Oppdatering av kundekort fra firmaoppslag bestått: sammenligning, bevaring av kontaktdata, felttilvalg, firmabytte, manuell lagring og samtidighetskontroll.");
