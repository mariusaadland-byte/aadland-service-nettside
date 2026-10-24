// Read-only internal report: based on currently administratively closed invoices.
// Closed date is NOT a VAT reporting-period date. Amounts follow issued invoice
// line rounding and immutable credit-note sums, not a cash-VAT assumption.
export function osloClosedDate(value){
 const date=new Date(value);
 if(!value||!Number.isFinite(date.getTime()))throw Error("Ugyldig avslutningsdato.");
 const pieces=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(date);
 const part=type=>pieces.find(x=>x.type===type)?.value;
 return [part("year"),part("month"),part("day")].join("-");
}

const amount=(v,label)=>{
 if(!Number.isSafeInteger(Number(v))||Number(v)<0)throw Error("Ugyldig "+label+".");
 return Number(v);
};
const rateOf=v=>{
 const n=Number(v);
 if(![0,12,15,25].includes(n))throw Error("Ukjent MVA-sats i fakturagrunnlaget.");
 return n;
};
const rounds=(quantity,unitPrice)=>{
 const q=Number(quantity);
 if(!Number.isFinite(q)||q<0||q>100000)throw Error("Ugyldig antall i fakturaen.");
 return Math.round(q*amount(unitPrice,"enhetspris"));
};
const emptyVat=()=>({0:{netOre:0,vatOre:0},12:{netOre:0,vatOre:0},15:{netOre:0,vatOre:0},25:{netOre:0,vatOre:0}});
const addGroup=(groups,rate,net,vat)=>{
 groups[rate].netOre+=net;groups[rate].vatOre+=vat;
};
const sum=(items,key)=>items.reduce((total,item)=>total+item[key],0);

export function buildClosedInvoiceReport(closures,invoices,creditNotes,{from="",to=""}={}){
 const realDate=v=>/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
 if(from&&!realDate(from))
  throw Error("Ugyldig fra-dato.");
 if(to&&!realDate(to))
  throw Error("Ugyldig til-dato.");
 if(from&&to&&from>to)throw Error("Fra-dato kan ikke være etter til-dato.");
 const byInvoice=new Map((invoices||[]).map(x=>[x.id,x]));
 const credits=new Map();
 for(const note of creditNotes||[]){
  if(!credits.has(note.invoice_id))credits.set(note.invoice_id,[]);
  credits.get(note.invoice_id).push(note);
 }
 const rows=[];
 const seen=new Set();
 for(const closure of closures||[]){
  if(!closure.closed_at)continue;
  const closedOn=osloClosedDate(closure.closed_at);
  if((from&&closedOn<from)||(to&&closedOn>to))continue;
  if(seen.has(closure.invoice_id))throw Error("En faktura forekommer flere ganger i avslutningsgrunnlaget.");
  seen.add(closure.invoice_id);
  const inv=byInvoice.get(closure.invoice_id);
  if(!inv||inv.status==="draft"||!inv.invoice_number||!Array.isArray(inv.line_items)||!inv.line_items.length)
   throw Error("Avsluttet faktura mangler dokumentgrunnlag.");
  const originalVat=emptyVat(),creditedVat=emptyVat();
  for(const line of inv.line_items){
   const rate=rateOf(line.vatRate),net=rounds(line.quantity,line.unitPriceOre);
   const vat=Math.round(net*rate/100);
   addGroup(originalVat,rate,net,vat);
  }
  const list=credits.get(inv.id)||[];
  for(const note of list){
   if(!Array.isArray(note.lines)||!note.lines.length)throw Error("Kreditnotaen mangler linjer.");
   let noteNet=0,noteVat=0;
   for(const line of note.lines){
    const rate=rateOf(line.vatRate),net=amount(line.netOre,"kreditert beløp"),
     vat=amount(line.vatOre,"kreditert MVA");
    if(Math.round(net*rate/100)!==vat)throw Error("MVA på kreditnotalinje stemmer ikke.");
    noteNet+=net;noteVat+=vat;
    addGroup(creditedVat,rate,net,vat);
   }
   if(noteNet!==amount(note.subtotal_ore,"kreditnotaens eks. MVA")||
      noteVat!==amount(note.vat_ore,"kreditnotaens MVA")||
      noteNet+noteVat!==amount(note.total_ore,"kreditnotaens sum"))
    throw Error("Kreditnotasummene stemmer ikke med linjene.");
  }
  const rates=[0,12,15,25];
  const originalNetOre=rates.reduce((s,rate)=>s+originalVat[rate].netOre,0);
  const originalVatOre=rates.reduce((s,rate)=>s+originalVat[rate].vatOre,0);
  const creditNetOre=rates.reduce((s,rate)=>s+creditedVat[rate].netOre,0);
  const creditVatOre=rates.reduce((s,rate)=>s+creditedVat[rate].vatOre,0);
  const creditOre=creditNetOre+creditVatOre;
  const grossOre=originalNetOre+originalVatOre;
  const paidOre=amount(inv.paid_ore,"innbetaling");
  if(creditOre!==amount(inv.credited_ore,"kreditert fakturabeløp"))
   throw Error("Kreditnotaene stemmer ikke med fakturaens saldo.");
  if(grossOre<=0||creditOre>grossOre||paidOre!==grossOre-creditOre)
   throw Error("En avsluttet faktura er ikke lenger fullt oppgjort. Åpne fakturaen og kontroller betalingshistorikken.");
  const netVat={};
  for(const rate of rates){
   const netOre=originalVat[rate].netOre-creditedVat[rate].netOre;
   const vatOre=originalVat[rate].vatOre-creditedVat[rate].vatOre;
   if(netOre<0||vatOre<0)throw Error("Kreditnota overstiger opprinnelig MVA-grunnlag.");
   netVat[rate]={netOre,vatOre};
  }
  rows.push({
   id:inv.id,invoiceNumber:inv.invoice_number,
   customerName:String(inv.customer?.name||""),invoiceDate:inv.issued_date||"",
   closedOn,closedAt:closure.closed_at,
   originalNetOre,originalVatOre,grossOre,
   creditNetOre,creditVatOre,creditOre,
   netSaleOre:originalNetOre-creditNetOre,netVatOre:originalVatOre-creditVatOre,
   netGrossOre:grossOre-creditOre,paidOre,
   creditNoteCount:list.length,vat:netVat
  });
 }
 rows.sort((a,b)=>b.closedAt.localeCompare(a.closedAt)||a.invoiceNumber.localeCompare(b.invoiceNumber));
 const total={
  count:rows.length,
  originalNetOre:sum(rows,"originalNetOre"),originalVatOre:sum(rows,"originalVatOre"),
  grossOre:sum(rows,"grossOre"),creditNetOre:sum(rows,"creditNetOre"),
  creditVatOre:sum(rows,"creditVatOre"),creditOre:sum(rows,"creditOre"),
  netSaleOre:sum(rows,"netSaleOre"),netVatOre:sum(rows,"netVatOre"),
  netGrossOre:sum(rows,"netGrossOre"),paidOre:sum(rows,"paidOre"),
  creditNoteCount:sum(rows,"creditNoteCount"),vat:emptyVat()
 };
 for(const row of rows)for(const rate of [0,12,15,25]){
  total.vat[rate].netOre+=row.vat[rate].netOre;
  total.vat[rate].vatOre+=row.vat[rate].vatOre;
 }
 if(total.netSaleOre+total.netVatOre!==total.netGrossOre||total.paidOre!==total.netGrossOre)
  throw Error("Totalsummene i rapporten stemmer ikke.");
 return {rows,total,period:{from,to},basis:"administrativ_avslutningsdato"};
}

const csvMoney=ore=>(ore/100).toFixed(2).replace(".",",");
const safeCsvCell=value=>{
 // Excel treats leading =, +, -, @, whitespace/control as formulas.
 const original=String(value??"").replace(/[\r\n\t\u0000-\u001f]+/g," ").trim();
 const sanitized=/^[=+\-@]/.test(original)?"'"+original:original;
 return '"'+sanitized.replace(/"/g,'""')+'"';
};
export function closedInvoiceReportCsv(report){
 const headers=[
  "Fakturanummer","Kunde","Fakturadato","Administrativt avsluttet",
  "Opprinnelig eks. MVA (kr)","Opprinnelig MVA (kr)","Opprinnelig inkl. MVA (kr)",
  "Kreditert eks. MVA (kr)","Kreditert MVA (kr)","Kreditert inkl. MVA (kr)",
  "Etter kreditering eks. MVA (kr)","Etter kreditering MVA (kr)",
  "Etter kreditering inkl. MVA (kr)","Netto registrert innbetalt (kr)",
  "Antall kreditnotaer",
  ...[0,12,15,25].flatMap(rate=>["Grunnlag "+rate+" % (kr)","MVA "+rate+" % (kr)"])
 ];
 const serialize=row=>[
  row.invoiceNumber||"",row.customerName||"",row.invoiceDate||"",row.closedOn||"",
  ...["originalNetOre","originalVatOre","grossOre","creditNetOre","creditVatOre","creditOre",
   "netSaleOre","netVatOre","netGrossOre","paidOre"].map(key=>csvMoney(row[key]||0)),
  row.creditNoteCount||0,
  ...[0,12,15,25].flatMap(rate=>[csvMoney(row.vat[rate].netOre),csvMoney(row.vat[rate].vatOre)])
 ];
 const total={...report.total,invoiceNumber:"SUM",customerName:"",invoiceDate:"",closedOn:""};
 const lines=[
  ["Rapporttype","Administrativt avsluttede fakturaer (ikke MVA-melding)"],
  ["Fra avslutningsdato",report.period.from||"Alle"],
  ["Til avslutningsdato",report.period.to||"Alle"],
  ["Merknad","MVA følger opprinnelige fakturaer og kreditnotaer, ikke betalingsdato. Avslutningsdato er ikke MVA-periode."],
  [],headers,...report.rows.map(serialize),serialize(total)
 ];
 return "\uFEFF"+lines.map(line=>line.map(safeCsvCell).join(";")).join("\r\n")+"\r\n";
}
