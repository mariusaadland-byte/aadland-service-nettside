import {invoiceGrossOre,invoicePaymentState} from "./invoicePaymentStatus";

const amount=n=>Number.isSafeInteger(Number(n))?Number(n):0;
const withinYear=(date,year)=>typeof date==="string"&&date.slice(0,4)===String(year);
const safeText=s=>String(s??"").replace(/[\r\n\t]+/g," ").trim();
const order=(a,b)=>String(b.date||"").localeCompare(String(a.date||""))||
 String(a.ref||"").localeCompare(String(b.ref||""));
const vatFromLines=lines=>(lines||[]).reduce((sum,line)=>{
 const base=Math.round(Number(line.quantity||0)*Number(line.unitPriceOre||0));
 return sum+Math.round(base*Number(line.vatRate||0)/100);
},0);
const netFromLines=lines=>(lines||[]).reduce((sum,line)=>
 sum+Math.round(Number(line.quantity||0)*Number(line.unitPriceOre||0)),0);

export function buildAccountingOverview({invoices=[],purchases=[],payments=[],transfers=[],files=[]},year,today){
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error("Ugyldig regnskapsår.");
 const activePurchases=purchases.filter(p=>!p.voided_at);
 const yearInvoices=invoices.filter(i=>i.status==="sent"&&withinYear(i.issued_date,year));
 const yearPurchases=activePurchases.filter(p=>withinYear(p.document_date,year));
 const invoiceById=new Map(invoices.map(i=>[i.id,i]));
 const filesByDocument=new Set(files.map(f=>f.purchase_document_id));
 const transferByDocument=new Map(transfers.map(t=>[t.purchase_document_id,t]));
 const sales=yearInvoices.map(i=>{
  const state=invoicePaymentState(i,today);
  return {id:i.id,number:i.invoice_number||"Mangler nummer",
   date:i.issued_date,dueDate:i.due_date||null,
   customer:safeText(i.customer?.name)||"Ukjent kunde",
   netOre:netFromLines(i.line_items),vatOre:vatFromLines(i.line_items),
   grossOre:invoiceGrossOre(i),paidOre:state.paid,
   outstandingOre:state.outstanding,creditedOre:state.credited,
   paymentStatus:state.key,paymentLabel:state.label,
   sentConfirmed:Boolean(i.sent_at)};
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const expenses=yearPurchases.map(p=>{
  const sign=p.kind==="credit"?-1:1;
  const total=sign*(amount(p.base_ore)+amount(p.vat_ore));
  const transfer=transferByDocument.get(p.id);
  return {id:p.id,number:p.supplier_document_number||"Uten nummer",
   date:p.document_date,supplier:safeText(p.supplier_name)||"Ukjent leverandør",
   kind:p.kind,grossOre:total,netOre:sign*amount(p.base_ore),
   vatOre:sign*amount(p.vat_ore),deductibleOre:sign*amount(p.deductible_vat_ore),
   hasAttachment:filesByDocument.has(p.id),transferStatus:transfer?.status||"not_sent"};
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const paymentRows=payments.filter(p=>!p.reversed_at&&withinYear(p.paid_on,year)&&
  invoiceById.has(p.invoice_id)&&invoiceById.get(p.invoice_id).status==="sent")
  .map(p=>({id:p.id,date:p.paid_on,invoiceNumber:invoiceById.get(p.invoice_id).invoice_number||"",
   customer:safeText(invoiceById.get(p.invoice_id).customer?.name),
   amountOre:amount(p.amount_ore),method:p.vipps_reference?"Vipps":"Annen betaling"}))
  .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const transferItems=activePurchases.map(p=>{
  const transfer=transferByDocument.get(p.id);
  return {id:p.id,number:p.supplier_document_number||"Uten nummer",
   supplier:safeText(p.supplier_name),date:p.document_date,
   hasAttachment:filesByDocument.has(p.id),state:transfer?.status||"not_sent",
   recipient:transfer?.recipient||null,attemptedAt:transfer?.attempted_at||null};
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const sum=(rows,key)=>rows.reduce((n,row)=>n+amount(row[key]),0);
 const ledger=[
  ...sales.map(x=>({key:"sale-"+x.id,date:x.date,kind:"Kundefaktura",name:x.customer,
   ref:x.number,salesOre:x.grossOre,expenseOre:0,receivedOre:0,vatOre:x.vatOre})),
  ...expenses.map(x=>({key:"purchase-"+x.id,date:x.date,
   kind:x.kind==="credit"?"Kreditnota fra leverandør":"Leverandørbilag",
   name:x.supplier,ref:x.number,salesOre:0,expenseOre:x.grossOre,
   receivedOre:0,vatOre:-x.deductibleOre})),
  ...paymentRows.map(x=>({key:"payment-"+x.id,date:x.date,kind:"Innbetaling ("+x.method+")",
   name:x.customer,ref:x.invoiceNumber,salesOre:0,expenseOre:0,
   receivedOre:x.amountOre,vatOre:0}))
 ].sort(order);
 const total={issuedCount:sales.length,paidCount:sales.filter(x=>x.paymentStatus==="paid").length,
  partialCount:sales.filter(x=>x.paymentStatus==="partial"||x.paymentStatus==="overdue"&&x.paidOre>0).length,
  unpaidCount:sales.filter(x=>x.outstandingOre>0).length,
  purchasesCount:expenses.length,transfersTotal:transferItems.length,
  transfersAccepted:transferItems.filter(x=>x.state==="accepted").length,
  transfersReview:transferItems.filter(x=>x.state==="sending"||x.state==="needs_review").length,
  transfersNotSent:transferItems.filter(x=>x.state==="not_sent").length,
  invoicedGrossOre:sum(sales,"grossOre"),
  invoicedNetOre:sum(sales,"netOre"),outputVatOre:sum(sales,"vatOre"),
  recordedPaidOnInvoicesOre:sum(sales,"paidOre"),
  recordedPaymentsThisYearOre:sum(paymentRows,"amountOre"),
  outstandingOre:sum(sales,"outstandingOre"),
  creditedOre:sum(sales,"creditedOre"),
  expenseGrossOre:sum(expenses,"grossOre"),expenseNetOre:sum(expenses,"netOre"),
  inputVatProposedOre:sum(expenses,"deductibleOre")
 };
 total.vatDifferenceIndicativeOre=total.outputVatOre-total.inputVatProposedOre;
 return {year,total,sales,expenses,payments:paymentRows,transfers:transferItems,ledger,
  warnings:[
   "Dette er en intern oversikt over fakturaer og kjøpsbilag registrert i Aadland Service, ikke et fullstendig bokført regnskap.",
   "Fakturert beløp sorteres etter fakturadato. Registrerte innbetalinger sorteres etter faktisk betalingsdato og vises separat for å unngå dobbeltelling.",
   "Kjøpsbilag er ikke dokumentasjon for at utgiften er betalt. MVA-differansen er bare et foreløpig forslag og erstatter ikke MVA-melding eller Tripletex-avstemming.",
   ...(total.creditedOre>0?["Kreditnotaer på kundefakturaer krever egen avstemming. Fakturert beløp og MVA vises før kreditering."]:[])
  ]};
}
export function accountingOverviewCsv(ledger){
 const quote=value=>{
  let s=String(value??"");
  if(/^\s*[=+\-@]/.test(s)&&!/^[-]?\d+(?:[,.]\d+)?$/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 const money=n=>(Number(n)/100).toFixed(2).replace(".",",");
 const rows=[["Dato","Type","Kunde eller leverandør","Referanse","Fakturert inkl. MVA (kr)",
  "Registrert kjøpsbilag inkl. MVA (kr)","Innbetalt (kr)","MVA-merknad (kr)"]];
 for(const r of ledger)rows.push([r.date,r.kind,r.name,r.ref,money(r.salesOre),
  money(r.expenseOre),money(r.receivedOre),money(r.vatOre)]);
 return "\uFEFF"+rows.map(row=>row.map(quote).join(";")).join("\r\n")+"\r\n";
}
