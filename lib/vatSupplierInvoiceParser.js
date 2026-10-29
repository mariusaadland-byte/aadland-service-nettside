// Supplier invoices need different field priorities from POS receipts.
// These values are suggestions only; bookkeeping continues to require manual review.
const compact=s=>String(s||"").replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();
const moneyRe=/(?<!\d)(?:\d{1,3}(?:[ .]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
const amountOre=s=>{
 const raw=compact(s).replace(/\s/g,"");
 let n;
 if(/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(raw))n=raw.replace(/\./g,"").replace(",",".");
 else if(/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(raw))n=raw.replace(/,/g,"");
 else if(/^\d+[,.]\d{2}$/.test(raw))n=raw.replace(",",".");
 else return null;
 const [whole,decimal]=n.split(".");
 const value=Number(whole)*100+Number(decimal);
 return Number.isSafeInteger(value)&&value>=0?value:null;
};
const amounts=s=>[...String(s||"").matchAll(moneyRe)]
 .map(x=>amountOre(x[0])).filter(Number.isSafeInteger);
const money=ore=>(ore/100).toFixed(2).replace(".",",");
const dateRe=/\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})\b/g;
function isoDate(s){
 const m=String(s||"").match(dateRe)?.[0];
 if(!m)return "";
 const parts=m.split(/[-/.]/);
 let y,mo,d;
 if(parts[0].length===4){[y,mo,d]=parts;}
 else {[d,mo,y]=parts;if(y.length===2)y="20"+y;}
 const iso=y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");
 const day=new Date(iso+"T12:00:00Z");
 return !Number.isNaN(day.getTime())&&day.toISOString().slice(0,10)===iso?iso:"";
}
const dateOnly=/^\s*(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})\s*$/;
function datedField(lines,label){
 const candidates=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const m=line.match(label);
  if(!m)continue;
  // Only read text that follows the label, never a date before it.
  const trailing=line.slice(m.index+m[0].length);
  let date=isoDate(trailing);
  if(!date&&dateOnly.test(lines[i+1]||""))date=isoDate(lines[i+1]);
  if(date)candidates.push(date);
 }
 const unique=[...new Set(candidates)];
 return unique.length===1?unique[0]:"";
}
const invoiceNumberLabel=/\b(?:faktura\s*(?:nummer|nr\.?|#)|fakturan(?:r\.?|ummer)|invoice\s*(?:no\.?|number))\s*[:#.\-]*\s*/i;
function invoiceNumber(lines){
 const unique=new Set();
 for(let i=0;i<lines.length;i++){
  const line=lines[i],m=line.match(invoiceNumberLabel);
  if(!m)continue;
  const text=line.slice(m.index+m[0].length).trim();
  const same=text.match(/^([A-Z0-9][A-Z0-9/._-]{2,40})(?![A-Z0-9/._-])/i);
  const next=(lines[i+1]||"").match(/^([A-Z0-9][A-Z0-9/._-]{2,40})$/i);
  const value=(same?.[1]||next?.[1]||"").replace(/[.,;:]$/,"");
  if(value&&!/^20\d{2}[-/.]\d{2}[-/.]\d{2}$/.test(value)&&
     !/^(?:dato|forfall|nr|nummer|kid|mva)$/i.test(value))unique.add(value);
 }
 return unique.size===1?[...unique][0]:"";
}
const bannedVendor=/^(?:faktura(?:nr|nummer)?|invoice|kunde|kundens|til:?\s|mottaker|fakturamottaker|betalingsinformasjon|betales|betalingsbetingelser|organisasjonsnummer|org\.?\s*nr|mva|dato|forfall|kid|bank|konto|iban|swift|sum|total|beløp|vare|beskrivelse|linje|adresse|side\s*\d|leveringsadresse|fakturaadresse|telefon|tlf|epost|e-post|www\.|https?:)/i;
const isBuyer=s=>/\baadland[\s-]*service\b/i.test(s)||/\b(?:til|kunde|fakturamottaker|mottaker)\s*:\s*/i.test(s);
function supplierName(lines){
 for(const line of lines.slice(0,16)){
  const m=line.match(/^(?:leverandør|utsteder|fra)\s*:\s*(.{4,90})$/i);
  if(m&&!isBuyer(m[1]))return compact(m[1]);
 }
 for(const raw of lines.slice(0,10)){
  const s=compact(raw);
  if(s.length<4||s.length>95||bannedVendor.test(s)||isBuyer(s)||
    /^\d/.test(s)||/[~^{}|]/.test(s))continue;
  if((s.match(/\d/g)||[]).length>s.length/4)continue;
  if((s.match(/[A-Za-zÆØÅæøå]/g)||[]).length<s.length*.6)continue;
  if(/\b(?:adresse|gate|veien|vegen|postboks)\b/i.test(s)&&/\d/.test(s))continue;
  return s;
 }
 return "";
}
const grossLabel=/(?:^|\s)(?:beløp\s*å\s*betale|sum\s*å\s*betale|til\s*betaling|å\s*betale|a\s*betale|fakturasum|totalt?\s*(?:inkl\.?\s*(?:mva|avgift))|sum\s*inkl\.?\s*mva|sum\s*totalt|total(?:t)?(?:\s*(?:kr|nok))?)(?![\w])/i;
const grossExclude=/\b(?:eks(?:kl)?\.?\s*mva|uten\s*mva|netto|mva\s*totalt|sum\s*mva|rabatt|saldo\s*fra|tidligere|restbeløp|innbetalt|betalt\s*(?:den|før)|å\s*kreditere)\b/i;
function grossTotal(lines){
 const found=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(grossExclude.test(line))continue;
  const label=line.match(grossLabel);if(!label)continue;
  const suffix=line.slice(label.index+label[0].length);
  let values=amounts(suffix);
  if(!values.length&&/^\s*(?:(?:kr|nok)\s*)?$/.test(suffix)){
   const next=lines[i+1]||"";
   if(/^(?:kr|nok)?\s*[\d\s.,]+\s*(?:kr|nok)?$/i.test(next))
    values=amounts(next);
  }
  if(values.length===1)found.push({value:values[0],priority:/å\s*betale|til\s*betaling|fakturasum/i.test(label[0])?2:1});
 }
 const preferred=found.filter(x=>x.priority===2);
 const set=new Set((preferred.length?preferred:found).map(x=>x.value));
 return set.size===1?[...set][0]:null;
}
function vatGroups(lines,total,warnings){
 const groups={};
 const add=(rate,base,vat)=>{
  if(![0,12,15,25].includes(rate)||!Number.isSafeInteger(base)||base<=0||
    !Number.isSafeInteger(vat)||Math.abs(vat-Math.round(base*rate/100))>5)return;
  const key=String(rate),existing=groups[key],row={base:money(base),vat:money(vat)};
  if(existing&&(existing.base!==row.base||existing.vat!==row.vat))groups[key]=null;
  else if(existing!==null)groups[key]=row;
 };
 // Explicit rate + taxable amount + VAT, possibly in a table on separate rows.
 let inVatTable=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/\b(?:mva|merverdiavgift)\b/i.test(line)&&/\b(?:grunnlag|eks(?:kl)?|netto)\b/i.test(line))
   inVatTable=true;
  const rateMatch=line.match(/\b(0|12|15|25)\s*(?:%|prosent)(?!\w)/);
  const labelledRate=/\b(?:mva|merverdiavgift)\b/i.test(line)||inVatTable;
  if(rateMatch&&labelledRate){
   const rate=Number(rateMatch[1]);
   let nums=amounts(line.slice(rateMatch.index+rateMatch[0].length));
   if(inVatTable&&nums.length<2){
    // A header may be followed by a rate line and then separate base/VAT amounts.
    const nearby=lines.slice(i+1,i+3);
    if(nearby.every(x=>!/^(?:total|sum\s*inkl|å\s*betale|forfall|dato)\b/i.test(x)))
     nums=[...nums,...nearby.flatMap(amounts)];
   }
   if(nums.length>=2)add(rate,nums[0],nums[1]);
  }
  if(inVatTable&&/^(?:sum|total|dato|forfall|kid)\b/i.test(line))inVatTable=false;
 }
 const netCandidates=[],taxCandidates=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/\b(?:sum|totalt?|beløp|grunnlag)\s*(?:eks(?:kl)?\.?|uten)\s*mva\b|\bmva\s*grunnlag\b|\bsum\s*netto\b/i.test(line)){
   const a=amounts(line);if(a.length===1)netCandidates.push(a[0]);
  }
  if(/\b(?:mva|merverdiavgift)\s*(?:totalt|sum|beløp)?\b|\bsum\s*mva\b/i.test(line)
    && !/\b(?:total|totalt|sum\s*inkl|fakturasum|å\s*betale|til\s*betaling)\b/i.test(line)
    && !/\bmva\s*(?:grunnlag|sats)\b/i.test(line)
    && !/\b(?:org|organisasjon)\b/i.test(line)){
   const a=amounts(line);
   if(a.length===1&&( /\b(?:sum|totalt|beløp)\s*mva\b|\bmva\s*(?:totalt|sum|beløp)?\s*[:\d]/i.test(line)))
    taxCandidates.push(a[0]);
  }
 }
 const onlyNet=[...new Set(netCandidates)],onlyTax=[...new Set(taxCandidates)];
 if(!Object.values(groups).some(Boolean)&&onlyNet.length===1&&onlyTax.length===1){
  const base=onlyNet[0],tax=onlyTax[0];
  const plausible=[0,12,15,25].filter(rate=>Math.abs(tax-Math.round(base*rate/100))<=5);
  if(plausible.length===1)add(plausible[0],base,tax);
 }
 if(Object.values(groups).some(x=>x===null)){
  warnings.push("Motstridende MVA-linjer i fakturaen. Kontroller beløpene manuelt.");return {};
 }
 const rows=Object.values(groups);
 if(rows.length&&Number.isSafeInteger(total)&&Math.abs(rows.reduce((sum,x)=>sum+amountOre(x.base)+amountOre(x.vat),0)-total)>5){
  warnings.push("MVA-grunnlaget og avgiften stemmer ikke med fakturasummen. Kontroller beløpene manuelt.");
  return {};
 }
 return groups;
}
export function isLikelySupplierInvoice(text){
 const t=String(text||"");
 const invoice=/\b(?:faktura(?:nummer|nr)?|invoice)\b/i.test(t);
 const strong=/\b(?:fakturanummer|fakturanr|faktura\s*nr\.?|fakturadato|forfallsdato|forfallsfrist|invoice\s*(?:date|number))\b/i.test(t);
 const other=/\b(?:kid(?:-nummer)?|til\s*betaling|kontonummer|forfall|fakturamottaker)\b/i.test(t);
 return Boolean(strong||(invoice&&other));
}
export function parseNorwegianSupplierInvoice(text){
 const lines=String(text||"").split(/\r?\n/).map(compact).filter(Boolean);
 const warnings=[];
 const supplierNameValue=supplierName(lines);
 const documentNumber=invoiceNumber(lines);
 const documentDate=datedField(lines,/\b(?:fakturadato|fakturert\s*dato|invoice\s*date)\s*[:.]?\s*/i)||
  datedField(lines,/^\s*dato\s*[:.]?\s*/i);
 const dueDate=datedField(lines,/\b(?:forfallsdato|forfall(?:sfrist)?|due\s*date)\s*[:.]?\s*/i);
 const totalOre=grossTotal(lines);
 const groups=vatGroups(lines,totalOre,warnings);
 if(!supplierNameValue)warnings.push("Leverandøren ble ikke lest sikkert. Sjekk avsenderen, ikke fakturamottakeren.");
 if(!documentNumber)warnings.push("Fakturanummeret mangler eller er uklart. Kontroller nummeret på fakturaen.");
 if(!documentDate)warnings.push("Fakturadatoen ble ikke sikkert lest. Ikke bruk forfallsdato som fakturadato.");
 if(!Number.isSafeInteger(totalOre))warnings.push("Fakturasummen kunne ikke leses entydig. Kontroller beløpet å betale.");
 if(!Object.keys(groups).length)warnings.push("MVA-beløpene kunne ikke avstemmes sikkert. Kontroller grunnlag og avgift.");
 return {supplierName:supplierNameValue,documentNumber,documentDate,dueDate,
  totalOre,groups,warnings,linesRead:lines.length,documentKind:"supplier-invoice"};
}
