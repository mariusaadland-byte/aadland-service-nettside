// Tracking-only documents created by another invoicing system.
// No invoice issuance, tax recognition, payment capture or accounting transfer.
const isoDate=d=>typeof d==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&
 Number.isFinite(Date.parse(d+"T00:00:00Z"))&&
 new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
export const externalInvoiceDate=isoDate;
export function parseExternalInvoiceOre(input){
 const raw=String(input??"").trim().replace(/\s/g,"");
 if(!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(raw))return null;
 const [whole,dec=""]=raw.replace(",",".").split(".");
 const ore=Number(whole)*100+Number(dec.padEnd(2,"0"));
 return Number.isSafeInteger(ore)&&ore>0&&ore<=100000000000?ore:null;
}
export function externalInvoiceInput(data){
 const sourceSystem=String(data?.sourceSystem||"").trim();
 const invoiceNumber=String(data?.invoiceNumber||"").trim();
 const customerName=String(data?.customerName||"").trim();
 const issuedOn=String(data?.issuedOn||"");
 const dueOn=String(data?.dueOn||"");
 const note=String(data?.note||"").trim();
 const amountOre=parseExternalInvoiceOre(data?.amount);
 if(!sourceSystem||sourceSystem.length>100||!invoiceNumber||invoiceNumber.length>90||
   !customerName||customerName.length>160||note.length>500||
   !isoDate(issuedOn)||!isoDate(dueOn)||dueOn<issuedOn||amountOre===null)
  throw Error("Kontroller fakturasystem, nummer, kundenavn, fakturadato, forfall og beløp.");
 if(data?.notDuplicateConfirmed!==true&&data?.notDuplicateConfirmed!=="true")
  throw Error("Bekreft at fakturaen ikke allerede ligger i registeret.");
 return {source_system:sourceSystem,invoice_number:invoiceNumber,customer_name:customerName,
  issued_on:issuedOn,due_on:dueOn,amount_ore:amountOre,note};
}
export function externalInvoicePaidInput(data,today){
 if(data?.action!=="mark-paid"||data?.confirmed!==true||
  !isoDate(String(data?.paidOn||""))||data.paidOn>today||
  typeof data?.paymentNote!=="string"||data.paymentNote.length>500)
  throw Error("Bekreft faktisk betaling, betalingsdato og eventuelt notat.");
 return {paid_on:data.paidOn,payment_note:data.paymentNote.trim()};
}
export const externalInvoiceStatus=x=>x?.status==="paid"?"Betalt":
 x?.due_on&&x.due_on<new Date().toISOString().slice(0,10)?"Forfalt":"Ubetalt";
