import {parseExternalInvoiceOre} from "./externalInvoiceRegister";
export const externalImportHeaders=[
 "INVOICE NO","INVOICE DATE","DUE DATE","CUSTOMER NAME",
 "CUSTOMER EMAIL","CUSTOMER PHONE","ORGANIZATION NO","COMMENTS",
 "CURRENCY","ORDER LINE - DESCRIPTION","ORDER LINE - UNIT PRICE",
 "ORDER LINE - COUNT","ORDER LINE - VAT CODE","PAID AMOUNT","PAYMENT TYPE"
];
const vatCodes={25:"3",15:"31",12:"33"};
const toNok=n=>(n/100).toFixed(2).replace(".",",");
const safeCsvCell=x=>{
 const t=String(x??"").replace(/[\r\n\t]/g," ").trim();
 return '"'+(/^[=+\-@]/.test(t)?"'"+t:t).replace(/"/g,'""')+'"';
};
const number=x=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=0;
export function validateExternalImport(invoice,body){
 if(!invoice||invoice.status!=="unpaid"&&invoice.status!=="paid")
  throw Error("Fakturaen kan ikke importeres med ukjent betalingsstatus.");
 const rate=Number(body?.vatRate),importNumber=Number(body?.importNumber);
 const baseOre=parseExternalInvoiceOre(body?.baseAmount);
 const total=Number(invoice.amount_ore),vatOre=baseOre===null?null:
  Math.round(baseOre*rate/100);
 if(!vatCodes[rate]||!Number.isSafeInteger(importNumber)||importNumber<10001||
  importNumber>999999999||baseOre===null||!number(total)||
  baseOre+vatOre!==total)
  throw Error("Velg korrekt MVA-sats, beløp eks. MVA og ledig numerisk fakturanummer. Summen må stemme nøyaktig med originalfakturaen.");
 const paid=invoice.status==="paid";
 const paymentType=String(body?.paymentTypeImportId||"").trim();
 if(paid&&!/^[A-Za-z0-9_-]{1,32}$/.test(paymentType))
  throw Error("Betalt faktura krever faktisk Import-ID for betalingsmåten i Tripletex. Ikke gjett dette feltet.");
 if(!paid&&paymentType)
  throw Error("En ubetalt faktura må ikke ha betalingstype ved import.");
 if(body?.vatConfirmed!==true||body?.notImportedConfirmed!==true||
  body?.correctCustomerConfirmed!==true)
  throw Error("Bekreft at MVA og kunden er kontrollert og at fakturaen ikke allerede ligger i Tripletex.");
 return {import_number:importNumber,vat_rate:rate,base_ore:baseOre,
  vat_ore:vatOre,snapshot_gross_ore:total,
  snapshot_sha256:invoice.sha256,
  snapshot_paid:paid,
  payment_type_import_id:paid?paymentType:null};
}
export function externalTripletexCsv(invoice,claim){
 if(!invoice||!claim||claim.status!=="prepared"||
  Number(invoice.amount_ore)!==Number(claim.snapshot_gross_ore)||
  invoice.sha256!==claim.snapshot_sha256||
  Boolean(invoice.status==="paid")!==Boolean(claim.snapshot_paid)||
  Number(claim.base_ore)+Number(claim.vat_ore)!==Number(claim.snapshot_gross_ore)||
  !vatCodes[Number(claim.vat_rate)]||
  (claim.snapshot_paid&&!claim.payment_type_import_id))
  throw Error("Fakturaen har endret seg etter kontroll, eller importen er allerede bekreftet. Ikke last ned ny fil.");
 const source=String(invoice.source_system||"").slice(0,100);
 const original=String(invoice.invoice_number||"").slice(0,90);
 const line=[
  String(claim.import_number),invoice.issued_on,invoice.due_on,
  invoice.customer_name,"","","",
  "Utstedt i "+source+". Originalnr "+original+
   ". Aadland arkiv-ID "+invoice.id+". IKKE send på nytt.", "NOK",
  "Ekstern originalfaktura "+original+" – kontrollert samlet én MVA-sats",
  toNok(Number(claim.base_ore)),"1",vatCodes[Number(claim.vat_rate)],
  claim.snapshot_paid?toNok(Number(claim.snapshot_gross_ore)):"",
  claim.snapshot_paid?claim.payment_type_import_id:""
 ];
 return "\uFEFF"+[externalImportHeaders,line]
  .map(row=>row.map(safeCsvCell).join(";")).join("\r\n")+"\r\n";
}
