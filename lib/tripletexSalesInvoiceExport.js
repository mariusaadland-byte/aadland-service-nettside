import {invoiceGrossOre,invoicePaymentState} from "./invoicePaymentStatus";
import {invoiceSettlementInfo} from "./invoiceSettlementInfo";

const day=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const num=s=>Number.isSafeInteger(Number(s))&&Number(s)>=0;
const vatCodes={25:"3",15:"31",12:"33"};
const formatOre=ore=>(Number(ore)/100).toFixed(2).replace(".",",");
const fmtQty=quantity=>String(Number(quantity)).replace(".",",");
const safeString=s=>String(s??"").replace(/[\r\n\t]+/g," ").trim();
const safeCsv=s=>{
 const str=String(s??"");
 return /^[\s]*[=+\-@]/.test(str)?"'"+str:str;
};
const cell=value=>'"'+safeCsv(value).replace(/"/g,'""')+'"';
const csv=rows=>"\uFEFF"+rows.map(row=>row.map(cell).join(";")).join("\r\n")+"\r\n";

export const importHeaders=[
 "INVOICE NO","INVOICE DATE","DUE DATE","CUSTOMER NAME",
 "CUSTOMER EMAIL","CUSTOMER PHONE","ORGANIZATION NO","COMMENTS",
 "CURRENCY","ORDER LINE - DESCRIPTION","ORDER LINE - UNIT PRICE",
 "ORDER LINE - COUNT","ORDER LINE - VAT CODE","PAID AMOUNT","PAYMENT TYPE"
];
export const archiveHeaders=[
 "Originalt fakturanummer","Fakturadato","Forfallsdato","Kunde","Kunde e-post",
 "Sum eks. MVA (kr)","MVA (kr)","Sum inkl. MVA (kr)",
 "Betalt (kr)","Gjenstående (kr)","Kreditert (kr)",
 "Status","Merknad","PDF-lenke","Aadland faktura-ID","Tripletex importnummer"
];

// Recorded manual invoice-payment entries are authoritative for payment source.
// Vipps callbacks also exist in a separate table and must not be summed twice.
export function auditInvoicePaymentEntries(invoice,entries=[]){
 const active=entries.filter(p=>p.reversed_at==null);
 const paid=Number(invoice?.paid_ore||0);
 const valid=active.every(p=>num(p.amount_ore)&&Number(p.amount_ore)>0);
 const recorded=active.reduce((sum,p)=>sum+Number(p.amount_ore||0),0);
 const vipps=active.filter(p=>p.vipps_reference).reduce((sum,p)=>sum+Number(p.amount_ore||0),0);
 const other=recorded-vipps;
 const source=vipps>0&&other>0?"mixed":vipps>0?"vipps":other>0?"other":"none";
 const a=invoice?.activity;
 const providerNet=a?Math.max(0,Number(a.vippsCapturedOre||0)-Number(a.vippsRefundedOre||0)):0;
 const matched=valid&&recorded===paid&&Number.isSafeInteger(recorded)&&
  (vipps===0||(a&&providerNet===vipps));
 return {matched,source,recordedOre:recorded,vippsOre:vipps,otherOre:other,entries:active.length};
}

// Conservatively choose invoice import only where financial state is known.
// A 0% VAT line cannot be mapped to code 5 vs 6 without tax context.
export function inspectSalesInvoice(invoice,today){
 if(invoice?.status!=="sent"||!invoice.invoice_number)return {state:"notIssued",reason:"Ikke sendt faktura"};
 const payment=invoicePaymentState(invoice,today);
 const settlement=invoiceSettlementInfo(invoice,today);
 const lines=invoice.line_items;
 if(!invoice.sent_at||!day(invoice.issued_date)||!day(invoice.due_date)||
  !invoice.customer?.name||!invoice.pdf_base64)
  return {state:"review",reason:"Mangler bekreftet sending, kunde, dato eller original-PDF",payment,settlement};
 if(!Array.isArray(lines)||!lines.length||
  lines.some(l=>!safeString(l.description)||!Number.isFinite(Number(l.quantity))||
   Number(l.quantity)<=0||!Number.isSafeInteger(Number(l.unitPriceOre))||
   Number(l.unitPriceOre)<0||Number(l.unitPriceOre)>100000000||
   ![0,12,15,25].includes(Number(l.vatRate))))
  return {state:"review",reason:"Ufullstendige ordrelinjer",payment,settlement};
 if(lines.some(l=>Number(l.vatRate)===0))
  return {state:"review",reason:"0 % MVA krever valg mellom avgiftsfri og unntatt omsetning",payment,settlement};
 if(payment.gross<=0||!num(invoice.paid_ore)||!num(invoice.credited_ore)||
  payment.paid>payment.total||settlement.needsReview)
  return {state:"review",reason:"Betaling, kreditnota eller oppgjør må kontrolleres",payment,settlement};
 if(payment.credited>0||Number(invoice.activity?.creditNoteCount||0)>0)
  return {state:"review",reason:"Kreditert faktura – importer kreditnota og oppgjør samlet",payment,settlement};
 if(payment.paid>0){
  const audit=invoice.paymentAudit;
  if(!audit?.matched||!["vipps","other"].includes(audit.source))
   return {state:"review",reason:"Betalinger kan ikke avstemmes entydig mot én betalingsmåte. Kontroller oppgjør før import.",payment,settlement};
  return {state:"paid",reason:audit.source==="vipps"?
   "Vipps-betaling verifisert – krever Vipps Import-ID i Tripletex":
   "Annen innbetaling verifisert – krever riktig betalingsform Import-ID i Tripletex",
   payment,settlement,paymentSource:audit.source};
 }
 return {state:"unpaid",reason:"Sendt og ubetalt – klar for fakturaimport",payment,settlement};
}
export function salesInvoiceExportOverview(invoices,today){
 const issued=(invoices||[]).filter(x=>x.status==="sent"&&x.invoice_number);
 issued.sort((a,b)=>String(a.issued_at||a.issued_date||"").localeCompare(String(b.issued_at||b.issued_date||""))||
  String(a.id).localeCompare(String(b.id)));
 const rows=issued.map((invoice,index)=>({invoice,numberOffset:index,
  ...inspectSalesInvoice(invoice,today)}));
 return {rows,summary:{
  total:rows.length,unpaid:rows.filter(x=>x.state==="unpaid").length,
  paid:rows.filter(x=>x.state==="paid").length,
  needsReview:rows.filter(x=>x.state==="review").length,
  withFrozenPdf:rows.filter(x=>Boolean(x.invoice.pdf_base64)).length
 }};
}
export function tripletexSalesInvoiceCsv(overview,{startNumber=80000000,
 includePaid=false,paymentTypeVipps="",paymentTypeOther="",selectedImportNumbers=null,selectedPaymentTypes=null}={}){
 if(!Number.isSafeInteger(startNumber)||startNumber<10001||
  startNumber+overview.rows.length>999999999)
  throw Error("Velg et ledig numerisk importintervall (10 001 til 999 999 999).");
 const types={vipps:safeString(paymentTypeVipps),other:safeString(paymentTypeOther)};
 const paidSources=new Set(overview.rows.filter(x=>x.state==="paid"&&(!selectedImportNumbers||Object.prototype.hasOwnProperty.call(selectedImportNumbers,x.invoice.id))).map(x=>x.paymentSource));
 if(includePaid&&[...paidSources].some(source=>
  !/^[A-Za-z0-9_-]{1,32}$/.test(types[source]||"")&&
  !overview.rows.filter(x=>x.state==="paid"&&x.paymentSource===source&&
   (!selectedImportNumbers||Object.prototype.hasOwnProperty.call(selectedImportNumbers,x.invoice.id)))
   .every(x=>/^[A-Za-z0-9_-]{1,32}$/.test(String(selectedPaymentTypes?.[x.invoice.id]||"")))))
  throw Error("Oppgi egne, gyldige Import-ID-er for hver betalingstype (Vipps og/eller annen innbetaling) i Tripletex.");
 const rows=[importHeaders],accepted=[];
 for(const item of overview.rows){
  if(selectedImportNumbers&&!Object.prototype.hasOwnProperty.call(selectedImportNumbers,item.invoice.id))continue;
  if(item.state!=="unpaid"&&!(includePaid&&item.state==="paid"))continue;
  const i=item.invoice,c=i.customer||{},paid=item.payment.paid;
  const selectedNumber=selectedImportNumbers?.[i.id];
  const mapped=String(selectedImportNumbers?Number(selectedNumber):startNumber+item.numberOffset);
  if(!/^[0-9]+$/.test(mapped)||Number(mapped)<10001||Number(mapped)>999999999)
   throw Error("Ugyldig lagret importnummer.");
  const comments="Allerede sendt fra Aadland Service. Opprinnelig fakturanr "+safeString(i.invoice_number)+
   "; kilde-ID "+String(i.id)+". IKKE send til kunden på nytt.";
  i.line_items.forEach((line,index)=>rows.push([
   mapped,i.issued_date,i.due_date,safeString(c.name),safeString(c.email),safeString(c.phone),
   safeString(c.organizationNumber),comments,"NOK",safeString(line.description),
   formatOre(Number(line.unitPriceOre)),fmtQty(line.quantity),vatCodes[Number(line.vatRate)],
   index===0&&paid>0?formatOre(paid):"",
   index===0&&paid>0?(selectedPaymentTypes?.[i.id]||types[item.paymentSource]):""
  ]));
  accepted.push({...item,importNumber:mapped});
 }
 if(!accepted.length)throw Error("Ingen fakturaer oppfyller vilkårene for den valgte importfilen.");
 return {csv:csv(rows),accepted};
}
export function salesInvoiceArchiveCsv(overview,{startNumber=80000000}={}){
 const rows=[archiveHeaders];
 for(const item of overview.rows){
  const i=item.invoice,p=item.payment||invoicePaymentState(i,"9999-12-31");
  const gross=invoiceGrossOre(i);
  const net=(i.line_items||[]).reduce((sum,l)=>sum+Math.round(Number(l.quantity||0)*Number(l.unitPriceOre||0)),0);
  const pdfLink=i.pdf_base64?"/api/admin/invoices/pdf?id="+encodeURIComponent(i.id):"";
  rows.push([i.invoice_number,i.issued_date,i.due_date,i.customer?.name,i.customer?.email,
   formatOre(net),formatOre(gross-net),formatOre(gross),formatOre(p.paid),
   formatOre(p.outstanding),formatOre(p.credited),item.state,item.reason,pdfLink,
   i.id,String(startNumber+item.numberOffset)]);
 }
 return csv(rows);
}
