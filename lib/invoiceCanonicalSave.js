// Compares the value displayed for a linked customer with what the invoice server
// actually wrote. Billing details are sensitive: a discrepancy must be reviewed
// before issuance, emailing or starting Vipps payments.
export const invoiceCustomerReviewFields=[
 ["contactId","Kundekort"],["name","Navn"],["email","E-post"],
 ["address","Fakturaadresse"],["phone","Telefon"],
 ["customerType","Kundetype"],["organizationNumber","Organisasjonsnummer"],
 ["contactPerson","Kontaktperson"],["paymentTermsDays","Betalingsfrist"]
];
const string=value=>String(value??"").trim();
export function invoiceCustomerSaveDifferences(before,after){
 if(!before||!after||typeof before!=="object"||typeof after!=="object")
  throw Error("Kunne ikke bekrefte lagrede kundeopplysninger. Last inn fakturakladden på nytt.");
 // Free-text invoices have no external contact to synchronize against.
 // Linked invoices must reconcile every material recipient field.
 if(!string(before.contactId))return [];
 return invoiceCustomerReviewFields.filter(([key])=>string(before[key])!==string(after[key]))
  .map(([key,label])=>({key,label,previous:string(before[key]),saved:string(after[key])}));
}
export function invoiceSavedDraft(snapshot,result){
 if(!snapshot||!result||typeof result.updatedAt!=="string"||
  !result.savedCustomer||typeof result.savedCustomer!=="object"||
  !result.savedCustomer.name&&Boolean(snapshot.customer?.contactId))
  throw Error("Lagring kunne ikke bekreftes. Last inn fakturakladden på nytt.");
 const changed=invoiceCustomerSaveDifferences(snapshot.customer||{},result.savedCustomer);
 return {
  updatedAt:result.updatedAt,
  changed,
  invoice:{...snapshot,updated_at:result.updatedAt,customer:result.savedCustomer}
 };
}
