// Read-only preparation for future direct invoice transfers.
// Never invent Tripletex customer IDs, VAT IDs or payment method IDs.
const vatNumberByRate={25:"3",15:"31",12:"33"};
const org=s=>String(s||"").replace(/\D/g,"");
const normal=s=>String(s||"").trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO");
const safeId=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):null;

export function findTripletexCustomer(customer,candidates){
 const organization=org(customer?.organizationNumber);
 const email=normal(customer?.email);
 const name=normal(customer?.name);
 if(!organization&&!email)return {id:null,reason:"Kunden mangler organisasjonsnummer og e-post for sikker matching."};
 const matches=(candidates||[]).filter(c=>organization?
  org(c.organizationNumber)===organization:
  normal(c.email||c.invoiceEmail)===email&&normal(c.name)===name);
 if(matches.length!==1||!safeId(matches[0]?.id))
  return {id:null,reason:matches.length>1?
   "Flere kunder matcher i Tripletex. Velg riktig kunde der først.":
   "Kunden finnes ikke med entydig match i Tripletex. Kontroller/opprett kunden der først."};
 return {id:Number(matches[0].id),reason:null};
}
export function findTripletexVatType(rate,vatTypes){
 const number=vatNumberByRate[Number(rate)];
 if(!number)return {id:null,reason:"MVA-satsen kan ikke mappes automatisk."};
 const candidates=(vatTypes||[]).filter(t=>String(t.number)===number&&safeId(t.id)&&
  (t.typeOfVat===undefined||t.typeOfVat==="OUTGOING"));
 if(candidates.length!==1)return {id:null,reason:"Fant ikke én entydig utgående MVA-type "+number+" i Tripletex."};
 return {id:Number(candidates[0].id),reason:null};
}
export function previewTripletexInvoice(item,customerCandidates,vatTypes){
 if(!item||!["unpaid","paid"].includes(item.state))
  return {ready:false,reason:"Fakturaen krever økonomisk kontroll før direkte overføring."};
 const invoice=item.invoice||{},customer=findTripletexCustomer(invoice.customer,customerCandidates);
 if(!customer.id)return {ready:false,reason:customer.reason};
 if(!invoice.invoice_number||!invoice.issued_date||!invoice.due_date||
  !Array.isArray(invoice.line_items)||!invoice.line_items.length)
  return {ready:false,reason:"Fakturadato, forfallsdato eller ordrelinjer mangler."};
 const lines=[];
 for(const [index,line] of invoice.line_items.entries()){
  const vat=findTripletexVatType(line.vatRate,vatTypes);
  if(!vat.id)return {ready:false,reason:vat.reason};
  const qty=Number(line.quantity),ore=Number(line.unitPriceOre);
  if(!Number.isFinite(qty)||qty<=0||!Number.isSafeInteger(ore)||ore<0)
   return {ready:false,reason:"Fakturalinjen har ugyldig antall eller pris."};
  const description=String(line.description||"").trim();
  if(!description)return {ready:false,reason:"En fakturalinje mangler beskrivelse."};
  lines.push({description:index===0?
   "Aadland Service ref. "+invoice.invoice_number+" – "+description:description,
   count:qty,unitPriceExcludingVatCurrency:ore/100,
   vatType:{id:vat.id}});
 }
 const body={
  invoiceDate:invoice.issued_date,
  invoiceDueDate:invoice.due_date,
  orders:[{
   orderDate:invoice.issued_date,deliveryDate:invoice.issued_date,
   customer:{id:customer.id},isPrioritizeAmountsIncludingVat:false,
   orderLines:lines
  }]
 };
 return {ready:true,customerId:customer.id,
  paidOre:Number(item.payment?.paid||0),
  expectedGrossOre:Number(item.payment?.gross||0),
  needsPaymentMapping:item.state==="paid",
  body};
}
