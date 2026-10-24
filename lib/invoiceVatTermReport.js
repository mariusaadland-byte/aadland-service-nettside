// Supporting turnover/output VAT reconciliation based on issued documents.
// This is NOT a complete VAT return: input VAT, exempt/zero-rate tax codes,
// discounts/refunds outside credit notes and late-issued invoices require review.
const rates=[0,12,15,25];
const integer=(v,label)=>{
 if(!Number.isSafeInteger(Number(v))||Number(v)<0)throw Error("Ugyldig "+label+".");
 return Number(v);
};
const signed=(v,label)=>{
 if(!Number.isSafeInteger(v))throw Error("Ugyldig sum for "+label+".");
 return v;
};
const emptyVat=()=>Object.fromEntries(rates.map(rate=>[rate,{baseOre:0,vatOre:0}]));
const validDay=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||"")))return false;
 const date=new Date(v+"T00:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===v;
};
export function vatTermBounds(year,term){
 const y=Number(year),t=Number(term);
 if(!Number.isInteger(y)||y<2000||y>2100||String(y)!==String(year)||
  !Number.isInteger(t)||t<1||t>6||String(t)!==String(term))
  throw Error("Velg et gyldig år og en MVA-termin (1–6).");
 const m=1+(t-1)*2;
 const start=year+"-"+String(m).padStart(2,"0")+"-01";
 const endMonth=m+1,endDay=new Date(Date.UTC(y,endMonth,0)).getUTCDate();
 const end=year+"-"+String(endMonth).padStart(2,"0")+"-"+String(endDay).padStart(2,"0");
 return {year:y,term:t,from:start,to:end,title:t+". termin "+y};
}
const vatRate=v=>{
 const n=Number(v);
 if(!rates.includes(n))throw Error("Ukjent MVA-sats i dokumentet. Kontroller fakturaen eller kreditnotaen.");
 return n;
};
const add=(byRate,rate,base,vat)=>{
 byRate[rate].baseOre=signed(byRate[rate].baseOre+base,"grunnlag");
 byRate[rate].vatOre=signed(byRate[rate].vatOre+vat,"MVA");
};
const copyVat=v=>Object.fromEntries(rates.map(rate=>[rate,{...v[rate]}]));
const vatSum=v=>rates.reduce((a,r)=>a+v[r].vatOre,0);
const baseSum=v=>rates.reduce((a,r)=>a+v[r].baseOre,0);
const rowSummarize=(doc,kind)=>{
 const vat=emptyVat();
 if(kind==="invoice"){
  if(!Array.isArray(doc.line_items)||!doc.line_items.length)
   throw Error("Utstedt faktura mangler fakturalinjer.");
  for(const l of doc.line_items){
   const rate=vatRate(l.vatRate),quantity=Number(l.quantity);
   if(!Number.isFinite(quantity)||quantity<0||quantity>100000)
    throw Error("Ugyldig antall på fakturalinjen.");
   const net=Math.round(quantity*integer(l.unitPriceOre,"enhetspris"));
   const tax=Math.round(net*rate/100);
   add(vat,rate,net,tax);
  }
 }else{
  if(!Array.isArray(doc.lines)||!doc.lines.length)
   throw Error("Kreditnotaen mangler kreditnotalinjer.");
  for(const l of doc.lines){
   const rate=vatRate(l.vatRate);
   const net=integer(l.netOre,"kreditert beløp"),tax=integer(l.vatOre,"kreditert MVA");
   if(Math.round(net*rate/100)!==tax)
    throw Error("Kreditnotalinjen har avvik mellom MVA-sats og MVA-beløp.");
   add(vat,rate,-net,-tax);
  }
  if(-baseSum(vat)!==integer(doc.subtotal_ore,"kreditnotaens nettobeløp")||
     -vatSum(vat)!==integer(doc.vat_ore,"kreditnotaens MVA")||
     -baseSum(vat)-vatSum(vat)!==integer(doc.total_ore,"kreditnotaens total"))
   throw Error("Kreditnotasummene stemmer ikke med kreditnotalinjene.");
 }
 return {vat,baseOre:baseSum(vat),vatOre:vatSum(vat)};
};
export function buildInvoiceVatTermReport(invoices,creditNotes,{year,term}){
 const period=vatTermBounds(String(year),String(term));
 const rows=[],seen=new Set();
 for(const doc of invoices||[]){
  if(doc.status==="draft")continue;
  const date=doc.issued_date;
  if(!validDay(date)||!doc.invoice_number||!doc.id)
   throw Error("Faktura mangler gyldig dokumentdato eller nummer.");
  if(date<period.from||date>period.to)
   throw Error("En faktura ligger utenfor valgt termin.");
  const key="invoice:"+doc.id;
  if(seen.has(key))throw Error("Duplisert faktura i rapportgrunnlaget.");
  seen.add(key);
  const {vat,baseOre,vatOre}=rowSummarize(doc,"invoice");
  if(baseOre+vatOre<=0)throw Error("Utstedt faktura har ikke positivt salgsbeløp.");
  rows.push({key,invoiceId:doc.id,documentNumber:doc.invoice_number,
   documentDate:date,kind:"invoice",kindLabel:"Faktura",customerName:String(doc.customer?.name||""),
   baseOre,vatOre,totalOre:baseOre+vatOre,vat});
 }
 for(const doc of creditNotes||[]){
  if(!validDay(doc.credit_date)||!doc.credit_number||!doc.id||!doc.invoice_id)
   throw Error("Kreditnota mangler gyldig dato eller dokumentnummer.");
  if(doc.credit_date<period.from||doc.credit_date>period.to)
   throw Error("En kreditnota ligger utenfor valgt termin.");
  const key="credit:"+doc.id;
  if(seen.has(key))throw Error("Duplisert kreditnota i rapportgrunnlaget.");
  seen.add(key);
  const {vat,baseOre,vatOre}=rowSummarize(doc,"credit");
  rows.push({key,invoiceId:doc.invoice_id,documentNumber:doc.credit_number,
   documentDate:doc.credit_date,kind:"credit",kindLabel:"Kreditnota",
   customerName:String(doc.customer?.name||""),
   baseOre,vatOre,totalOre:baseOre+vatOre,vat});
 }
 rows.sort((a,b)=>a.documentDate.localeCompare(b.documentDate)||
  a.documentNumber.localeCompare(b.documentNumber));
 const totalVat=emptyVat();
 const amounts={invoiceCount:0,creditCount:0,baseOre:0,vatOre:0,grossOre:0,
  invoiceGrossOre:0,creditedGrossOre:0,vat:totalVat};
 for(const row of rows){
  amounts[row.kind==="invoice"?"invoiceCount":"creditCount"]++;
  amounts.baseOre=signed(amounts.baseOre+row.baseOre,"sum grunnlag");
  amounts.vatOre=signed(amounts.vatOre+row.vatOre,"sum MVA");
  amounts.grossOre=signed(amounts.grossOre+row.totalOre,"samlet inkl. MVA");
  if(row.kind==="invoice")amounts.invoiceGrossOre+=row.totalOre;
  else amounts.creditedGrossOre+=-row.totalOre;
  for(const rate of rates)add(totalVat,rate,row.vat[rate].baseOre,row.vat[rate].vatOre);
 }
 if(amounts.baseOre+amounts.vatOre!==amounts.grossOre||
    baseSum(amounts.vat)!==amounts.baseOre||vatSum(amounts.vat)!==amounts.vatOre)
  throw Error("Rapportsummer kan ikke avstemmes.");
 return {period,rows,total:amounts,basis:"utstedelsesdato",
  limitations:"Kun utgående MVA fra fakturaer og kreditnotaer i Aadland Service. Ikke inngående MVA, alle salgskanaler eller bokførte MVA-koder."};
}
const cell=v=>{
 const raw=String(v??"").replace(/[\r\n\t\u0000-\u001f]+/g," ").trim();
 const safe=/^[=+\-@]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
};
const kroner=n=>(n/100).toFixed(2).replace(".",",");
export function invoiceVatTermCsv(report){
 const header=["Type","Dokumentnummer","Dokumentdato","Fakturanummer-referanse","Kunde",
  "Grunnlag eks. MVA (kr)","Utgående MVA (kr)","Beløp inkl. MVA (kr)",
  ...rates.flatMap(r=>["Grunnlag "+r+" % (kr)","MVA "+r+" % (kr)"])];
 const line=row=>[row.kindLabel,row.documentNumber,row.documentDate,
  row.invoiceNumberReference||"",row.customerName,
  kroner(row.baseOre),kroner(row.vatOre),kroner(row.totalOre),
  ...rates.flatMap(r=>[kroner(row.vat[r].baseOre),kroner(row.vat[r].vatOre)])];
 const last={kindLabel:"SUM",documentNumber:"",documentDate:"",
  invoiceNumberReference:"",customerName:"",baseOre:report.total.baseOre,
  vatOre:report.total.vatOre,totalOre:report.total.grossOre,vat:report.total.vat};
 const meta=[["Rapport","Utgående MVA fra utstedte fakturaer/kreditnotaer – avstemming, ikke MVA-melding"],
  ["Termin",report.period.title],["Dokumentdato fra",report.period.from],
  ["Dokumentdato til",report.period.to],
  ["Avgrensning",report.limitations],
  ["Merknad","Kreditnota føres med negativt fortegn i sin egen dokumenttermin. Inngående MVA inngår ikke."],
  [],header,...report.rows.map(line),line(last)];
 return "\uFEFF"+meta.map(a=>a.map(cell).join(";")).join("\r\n")+"\r\n";
}
