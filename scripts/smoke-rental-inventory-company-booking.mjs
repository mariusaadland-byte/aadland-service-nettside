import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const validateSource=readFileSync("lib/rentalCustomerType.js","utf8").replace(/^export /gm,"");
const {validNorwegianOrganizationNumber,rentalCustomerClassification}=
 new Function(validateSource+";return {validNorwegianOrganizationNumber,rentalCustomerClassification};")();
const fakeOrg=prefix=>{
 const weights=[3,2,7,6,5,4,3,2];
 const sum=prefix.split("").reduce((a,d,i)=>a+Number(d)*weights[i],0);
 const check=11-sum%11;
 if(check===10)throw Error("invalid fixture");
 return prefix+(check===11?0:check);
};
const org=fakeOrg("12345678");
assert.ok(validNorwegianOrganizationNumber(org));
assert.ok(validNorwegianOrganizationNumber(org.slice(0,3)+" "+org.slice(3)));
assert.equal(validNorwegianOrganizationNumber(org.slice(0,-1)+"9"),false);
assert.equal(validNorwegianOrganizationNumber("12345678"),false);
assert.equal(validNorwegianOrganizationNumber("1234567890"),false);
assert.equal(validNorwegianOrganizationNumber("ABCDEFGHI"),false);
assert.deepEqual(rentalCustomerClassification({}),{type:"private",company:null});
assert.deepEqual(rentalCustomerClassification({customerType:"private",
 company:{name:"Ignored",organizationNumber:org}}),{type:"private",company:null});
const valid=rentalCustomerClassification({customerType:"company",company:{
 name:"  Test Verksted AS ",organizationNumber:org,invoiceEmail:"FAKTURA@example.invalid"
}});
assert.equal(valid.error,undefined);
assert.equal(valid.type,"company");
assert.equal(valid.company.name,"Test Verksted AS");
assert.equal(valid.company.invoiceEmail,"faktura@example.invalid");
assert.match(rentalCustomerClassification({customerType:"company"}).error,/firmanavn/i);
assert.match(rentalCustomerClassification({customerType:"company",
 company:{name:"Test AS",organizationNumber:org.slice(0,-1)+"9"}}).error,/organisasjonsnummer/i);
assert.match(rentalCustomerClassification({customerType:"company",
 company:{name:"Test AS",organizationNumber:org,invoiceEmail:"bad"}}).error,/e-post/i);
assert.match(rentalCustomerClassification({customerType:"other"}).error,/privatperson/i);
const rental=readFileSync("app/api/rental-bookings/route.js","utf8");
const checkout=readFileSync("app/utleie/[slug]/page.js","utf8");
const inventory=readFileSync("app/admin/utleie/RentalInventoryClient.js","utf8");
const editor=readFileSync("app/admin/utleie/ny/NewRentalItemClient.js","utf8");
const editPage=readFileSync("app/admin/utleie/[id]/page.js","utf8");
const publicPages=["app/admin/utleie/page.js","app/admin/utleie/[id]/page.js"];
assert.ok(rental.includes("rentalCustomerClassification(b)"));
assert.ok(rental.includes('customerType:customerType.type'));
assert.ok(rental.includes('if(customerType.type==="company"){'));
assert.ok(rental.includes('if(!customerUserId)'));
assert.ok(rental.includes('String(verified?.email||"").trim().toLowerCase()!==email'));
assert.ok(rental.includes('billing=await rentalBillingDecision(s,email,p.totalOre)'));
assert.ok(rental.includes('if(!billing.eligible)'));
assert.ok(rental.includes('paymentReady=customerType.type==="private"'));
assert.ok(rental.includes('pending_payment:pendingPayment'));
assert.ok(rental.includes('paymentUrl,'));
assert.ok(rental.indexOf('if(customerType.type==="company"){') < rental.indexOf('create_rental_booking_if_available'),"Corporate authorization must happen before booking reservation");
assert.ok(rental.includes('status:403')||rental.includes('{status:403}'));
assert.ok(checkout.includes('customerType==="company"'));
assert.ok(checkout.includes('customerType==="private"'));
assert.ok(checkout.includes("organizationNumber"));
assert.ok(checkout.includes("invoiceEmail"));
assert.ok(inventory.includes('href={"/admin/utleie/"+encodeURIComponent(item.id)}'));
assert.ok(inventory.includes("item.active&&item.status"));
assert.ok(inventory.includes('fetch("/api/admin/rental"'));
assert.ok(editor.includes('method:itemId?"PATCH":"POST"'));
assert.ok(editor.includes('setV({'));
assert.ok(editor.includes('router.push("/admin/utleie")'));
assert.ok(editor.includes('itemId&&!itemLoaded'));
assert.ok(editor.includes('Produktet ble ikke lastet. Ingen endringer kan lagres.'));
assert.ok(editPage.includes('hasPermission("canManageProducts")'));
for(const path of publicPages){
 const source=readFileSync(path,"utf8");
 assert.ok(source.includes('getAdminUser()'));
 assert.ok(source.includes('hasPermission("canManageProducts")'));
 assert.ok(source.includes('redirect("/admin/login")'));
}
assert.ok(readFileSync("app/admin/mobil/page.js","utf8").includes('href:"/admin/utleie"'));
console.log("Utleieadministrasjon og privat-/bedriftsbooking bestått: rettigheter, redigering, feltvalidering og kredittsperre.");
