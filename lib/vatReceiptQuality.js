// OCR passes are only proposals. Merge complementary fields, but never invent
// a date, receipt number, gross sum, or VAT rate when two reads disagree.
export function vatReceiptScanQuality(scan){
 const p=scan?.parsed||{};
 const groupCount=Object.keys(p.groups||{}).length;
 const essential=[Boolean(p.supplierName),Boolean(p.documentDate),Number.isSafeInteger(p.totalOre)].filter(Boolean).length;
 const confidence=Number.isFinite(scan?.confidence)?Math.max(0,Math.min(100,scan.confidence)):null;
 return {
  essential,groupCount,
  score:(p.supplierName?2:0)+(p.documentNumber?1:0)+(p.documentDate?3:0)+
   (Number.isSafeInteger(p.totalOre)?3:0)+(groupCount?4+Math.min(groupCount-1,2):0)+
   (confidence===null?0:confidence/70)
 };
}
export function needsVatReceiptRetry(scan){
 const q=vatReceiptScanQuality(scan);
 // A missing receipt number or date forces manual entry. Give the alternate
 // layout a chance even when the other OCR fields seem readable.
 return (Number.isFinite(scan?.confidence)&&scan.confidence<58)||
  q.essential<3||q.groupCount===0||!scan?.parsed?.documentNumber;
}
const ore=input=>{
 const text=String(input||"").trim().replace(/\s/g,"");
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(text))return null;
 const [whole,decimals=""]=text.replace(",",".").split(".");
 const value=Number(whole)*100+Number(decimals.padEnd(2,"0"));
 return Number.isSafeInteger(value)?value:null;
};
const amountPresent=v=>Number.isSafeInteger(v)&&v>=0;
const sameGroup=(a,b)=>ore(a?.base)===ore(b?.base)&&ore(a?.vat)===ore(b?.vat);
const groupGross=groups=>{
 let sum=0;
 for(const [rate,entry] of Object.entries(groups)){
  const base=ore(entry?.base),vat=ore(entry?.vat),pct=Number(rate);
  if(base===null||vat===null||base<=0||![0,12,15,25].includes(pct)||
     Math.abs(vat-Math.round(base*pct/100))>5)return null;
  sum+=base+vat;
 }
 return sum;
};
const isAmbiguousDate=scan=>(scan?.parsed?.warnings||[]).some(w=>/flere mulige dokumentdatoer|ulike datoer/i.test(w));
export function chooseVatReceiptScan(original,alternative){
 if(!alternative)return {...original,retried:false};
 const baseline=vatReceiptScanQuality(original);
 const next=vatReceiptScanQuality(alternative);
 const preferred=next.score>baseline.score+.35?alternative:original;
 const other=preferred===original?alternative:original;
 const p=preferred.parsed||{},q=other.parsed||{};
 const warnings=[];
 const suggested=(key)=>p[key]||q[key]||"";
 const differing=(key)=>Boolean(p[key]&&q[key]&&p[key]!==q[key]);
 const documentDate=differing("documentDate")||isAmbiguousDate(original)||isAmbiguousDate(alternative)?"":suggested("documentDate");
 if(!documentDate)warnings.push(differing("documentDate")
  ?"To ulike datoer ble lest fra samme kvittering. Sjekk dokumentdatoen manuelt."
  :"Kontroller dokumentdatoen manuelt.");
 const documentNumber=differing("documentNumber")?"":suggested("documentNumber");
 if(differing("documentNumber"))
  warnings.push("To ulike kvitteringsnummer ble lest. Sjekk nummeret manuelt.");
 const dueDate=differing("dueDate")?"":suggested("dueDate");
 if(differing("dueDate"))warnings.push("To ulike forfallsdatoer ble lest fra fakturaen. Kontroller forfall manuelt.");
 const supplierName=suggested("supplierName");
 if(differing("supplierName"))
  warnings.push("Tekstlesingen ga ulike leverandørnavn. Kontroller leverandøren.");
 const totalConflict=amountPresent(p.totalOre)&&amountPresent(q.totalOre)&&p.totalOre!==q.totalOre;
 const totalOre=totalConflict?null:amountPresent(p.totalOre)?p.totalOre:amountPresent(q.totalOre)?q.totalOre:null;
 if(totalConflict)warnings.push("To ulike totalbeløp ble lest. Kontroller kvitteringen før du fyller inn beløp.");
 const groups={};
 let vatConflict=false;
 for(const rate of new Set([...Object.keys(p.groups||{}),...Object.keys(q.groups||{})])){
  const a=p.groups?.[rate],b=q.groups?.[rate];
  if(a&&b&&!sameGroup(a,b)){vatConflict=true;continue;}
  const entry=a||b;
  if(entry)groups[rate]=entry;
 }
 if(vatConflict)warnings.push("MVA-tallene var forskjellige mellom leseforsøkene. Kontroller grunnlag og avgift.");
 const candidateGross=groupGross(groups);
 if(candidateGross===null||totalConflict||vatConflict){
  for(const rate of Object.keys(groups))delete groups[rate];
 }else if(totalOre!==null&&Object.keys(groups).length&&Math.abs(candidateGross-totalOre)>5){
  for(const rate of Object.keys(groups))delete groups[rate];
  warnings.push("MVA-grunnlaget og avgiften stemmer ikke med totalsummen. Beløpene må kontrolleres manuelt.");
 }
 if(!supplierName)warnings.push("Leverandøren ble ikke gjenkjent.");
 if(!documentNumber)warnings.push("Bilags-/kvitteringsnummer ble ikke sikkert lest. Skriv det fra kvitteringen.");
 if(totalOre===null&&!totalConflict)warnings.push("Totalbeløpet ble ikke tydelig lest. Kontroller summen på kvitteringen.");
 if(Object.keys(groups).length===0)
  warnings.push("Kunne ikke lese sikkert grunnlag og MVA-sats. Fyll inn beløpene fra kvitteringen.");
 return {
  ...preferred,
  text:String(preferred.text||"")+"\n\n--- Alternativ OCR-lesing ---\n"+String(other.text||""),
  parsed:{
   ...p,supplierName,documentNumber,documentDate,dueDate,totalOre,groups,warnings
  },
  retried:true
 };
}
