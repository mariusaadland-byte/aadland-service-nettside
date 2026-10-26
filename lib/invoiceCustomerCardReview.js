// Diff an invoice draft's stored customer snapshot against the central customer card.
// Never copy internal notes or issue/sending fields into customer-facing documents.
export const comparisonFields=[
 {key:"name",label:"Navn"},
 {key:"customerType",label:"Kundetype"},
 {key:"organizationNumber",label:"Organisasjonsnummer"},
 {key:"contactPerson",label:"Kontaktperson"},
 {key:"address",label:"Adresse"},
 {key:"email",label:"E-post"},
 {key:"phone",label:"Telefon"},
 {key:"paymentTermsDays",label:"Betalingsfrist (dager)"}
];
const text=x=>String(x??"").trim();
export function invoiceCustomerCardReview(customer,contact){
 if(!customer||!contact||!contact.id||!contact.name||
  String(customer.contactId||"")!==String(contact.id))
  throw Error("Kundekortet stemmer ikke med den valgte fakturakunden.");
 const newType=contact.customerType==="business"?"business":"private";
 const oldType=customer.customerType==="business"?"business":"private";
 const existing={
  ...customer,customerType:oldType,
  organizationNumber:oldType==="business"?text(customer.organizationNumber):"",
  contactPerson:oldType==="business"?text(customer.contactPerson):""
 };
 const latest={
  name:contact.name,customerType:newType,
  organizationNumber:newType==="business"?text(contact.organizationNumber):"",
  contactPerson:newType==="business"?text(contact.contactPerson):"",
  address:contact.address||"",email:contact.email||"",phone:contact.phone||"",
  paymentTermsDays:Number(contact.paymentTermsDays??14)
 };
 const fields=comparisonFields.map(field=>({
  key:field.key,label:field.label,
  onInvoice:text(existing[field.key]),
  onCard:text(latest[field.key]),
  changed:text(existing[field.key])!==text(latest[field.key])
 })).filter(item=>item.changed);
 return {changed:fields.length>0,fields,contactId:contact.id,
  // Payment route, work/delivery details, prices, notes and manual due date are excluded.
  safeToApply:fields.length>0};
}
