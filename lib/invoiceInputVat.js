import {vatTermBounds} from "./invoiceVatTermReport";
const rates=[0,12,15,25];
export const parseKronerOre=value=>{
 const raw=String(value??"").trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(raw))throw Error("Skriv kroner med maks to desimaler, for eksempel 1250,50.");
 const [whole,decimals=""]=raw.replace(",",".").split(".");
 const ore=Number(whole)*100+Number(decimals.padEnd(2,"0"));
 if(!Number.isSafeInteger(ore)||ore<0)throw Error("Ugyldig beløp.");
 return ore;
};
export const oreToInput=value=>Number.isSafeInteger(value)&&(value>=0)?
 (value/100).toFixed(2).replace(".",","):"";
export const validInvoiceDay=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")))return false;
 const d=new Date(value+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
export function validateVatPurchaseInput(input){
 const supplierName=String(input?.supplierName||"").trim();
 const documentNumber=String(input?.documentNumber||"").trim();
 const evidenceReference=String(input?.evidenceReference||"").trim();
 const purpose=String(input?.businessPurpose||"").trim();
 const kind=input?.kind;
 const documentDate=input?.documentDate;
 const originalDocument=String(input?.originalDocumentNumber||"").trim();
 const percent=Number(input?.deductionPercent);
 if(supplierName.length<2||supplierName.length>160)throw Error("Oppgi leverandørens navn.");
 if(!documentNumber||documentNumber.length>90)throw Error("Oppgi fakturanummeret fra leverandøren.");
 if(!validInvoiceDay(documentDate))throw Error("Oppgi gyldig dokumentdato (faktura-/kreditnotadato).");
 if(!["purchase","credit"].includes(kind))throw Error("Velg kjøpsfaktura eller leverandørkreditnota.");
 if(kind==="credit"&&(!originalDocument||originalDocument.length>90))
  throw Error("Leverandørens kreditnota må knyttes til opprinnelig fakturanummer.");
 if(evidenceReference.length<3||evidenceReference.length>260)
  throw Error("Oppgi hvor originalbilaget er lagret i regnskapet.");
 if(purpose.length<5||purpose.length>500)
  throw Error("Beskriv hvordan kjøpet er brukt i avgiftspliktig virksomhet.");
 if(!Number.isInteger(percent)||percent<0||percent>100)
  throw Error("Velg fradragsandel mellom 0 og 100 prosent.");
 if(input.documentConfirmed!==true||input.deductionConfirmed!==true)
  throw Error("Dokumentasjon og fradragsrett må kontrolleres før registrering.");
 const groups={},source=input?.groups;
 if(!source||typeof source!=="object"||Array.isArray(source))throw Error("MVA-linjene mangler.");
 if(Object.keys(source).some(k=>!rates.includes(Number(k))))
  throw Error("Ukjent MVA-sats.");
 let baseOre=0,vatOre=0;
 for(const rate of rates){
  const g=source[rate]||source[String(rate)]||{};
  const baseRaw=String(g.base??"").trim(),vatRaw=String(g.vat??"").trim();
  if(!baseRaw&&!vatRaw)continue;
  const net=parseKronerOre(baseRaw||"0"),tax=parseKronerOre(vatRaw||"0");
  if(net===0&&tax===0)continue;
  if(net===0||Math.abs(tax-Math.round(net*rate/100))>5)
   throw Error("MVA for "+rate+" % må stemme med dokumentet og satsen (maks 0,05 kr avrundingsavvik).");
  groups[rate]={baseOre:net,vatOre:tax};
  baseOre+=net;vatOre+=tax;
 }
 if(baseOre<=0||!Number.isSafeInteger(baseOre)||!Number.isSafeInteger(vatOre))
  throw Error("Fyll inn positivt kjøpsbeløp fra leverandørfakturaen.");
 const deductibleVatOre=Math.round(vatOre*percent/100);
 const grossOre=baseOre+vatOre;
 if(!Number.isSafeInteger(grossOre)||!Number.isSafeInteger(deductibleVatOre))
  throw Error("Beløpet er for stort.");
 if(kind==="purchase"&&grossOre>=1000000&&input.bankConditionConfirmed!==true)
  throw Error("Kjøp på minst 10 000 kr krever særskilt kontroll av betaling via bank.");
 return {
  supplier_name:supplierName,supplier_document_number:documentNumber,
  document_date:documentDate,kind,original_document_number:kind==="credit"?originalDocument:null,
  evidence_reference:evidenceReference,business_purpose:purpose,vat_groups:groups,
  deduction_percent:percent,base_ore:baseOre,vat_ore:vatOre,
  deductible_vat_ore:deductibleVatOre
 };
}
export function calculateInputVatSummary(documents,{year,term}){
 const bounds=vatTermBounds(String(year),String(term));
 const byRate=Object.fromEntries(rates.map(r=>[r,{baseOre:0,vatOre:0}]));
 const rows=[];let inputVatOre=0,vatOnPurchasesOre=0,pendingCount=0;
 for(const doc of documents||[]){
  if(doc.voided_at)continue;
  if(!validInvoiceDay(doc.document_date)||doc.document_date<bounds.from||
     doc.document_date>bounds.to)throw Error("Kjøpsbilag med ugyldig dato/termin.");
  const factor=doc.kind==="credit"?-1:doc.kind==="purchase"?1:0;
  if(!factor)throw Error("Ukjent dokumenttype for leverandørbilag.");
  const amount=Number(doc.deductible_vat_ore),vat=Number(doc.vat_ore),base=Number(doc.base_ore);
  if(![amount,vat,base].every(Number.isSafeInteger)||amount<0||vat<0||base<=0||
    amount>vat||!doc.evidence_reference)throw Error("Bilag mangler kontrollert fradragsgrunnlag.");
  const groups=doc.vat_groups||{};
  let groupsBase=0,groupsVat=0;
  for(const [k,g] of Object.entries(groups)){
   const rate=Number(k);
   if(!rates.includes(rate))throw Error("Ukjent MVA-sats i innkjøpsbilaget.");
   const n=Number(g.baseOre),v=Number(g.vatOre);
   if(!Number.isSafeInteger(n)||!Number.isSafeInteger(v)||n<0||v<0||
     Math.abs(v-Math.round(n*rate/100))>5)throw Error("Avvik i kjøpsbilagets MVA-linjer.");
   groupsBase+=n;groupsVat+=v;
   byRate[rate].baseOre+=factor*n;
   byRate[rate].vatOre+=factor*v;
  }
  if(groupsBase!==base||groupsVat!==vat||
    Math.round(vat*Number(doc.deduction_percent)/100)!==amount)
   throw Error("Innkjøpsbilaget stemmer ikke med MVA-linjene.");
  inputVatOre+=factor*amount;
  vatOnPurchasesOre+=factor*vat;
  rows.push({
   id:doc.id,date:doc.document_date,supplier:doc.supplier_name,
   documentNumber:doc.supplier_document_number,kind:doc.kind,
   baseOre:factor*base,vatOre:factor*vat,deductibleVatOre:factor*amount,
   deductionPercent:doc.deduction_percent,evidenceReference:doc.evidence_reference
  });
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.documentNumber.localeCompare(b.documentNumber));
 return {rows,inputVatOre,vatOnPurchasesOre,byRate,documentCount:rows.length,
  isPartial:true,
  warning:"Manuelt bekreftede bilagsreferanser i Aadland Service, ikke import av alle kostnader fra regnskapet. Fradragsrett, bilag og bankbetaling må avstemmes mot regnskapet."};
}
export function mergedVatReport(sales,purchases){
 const outputVatOre=Number(sales?.total?.vatOre);
 if(!Number.isSafeInteger(outputVatOre)||!Number.isSafeInteger(purchases?.inputVatOre))
  throw Error("Utgående og inngående MVA kan ikke avstemmes.");
 return {...sales,
  limitations:"Utgående MVA fra salgsdokumenter i Aadland Service, pluss kun inngående MVA fra manuelt bekreftede leverandørbilag i dette registeret. Ikke en komplett MVA-melding.",
  purchases,comparison:{
  outputVatOre,inputVatOre:purchases.inputVatOre,
  differenceOre:outputVatOre-purchases.inputVatOre,
  isComplete:false,
  warning:"Foreløpig differanse – ikke MVA å betale eller til gode før alle leverandørbilag og øvrige MVA-poster er avstemt i regnskapssystemet."
 }};
}
export function combinedVatCsv(report,salesCsv){
 const existing=String(salesCsv||"").replace(/^\uFEFF/,"").replace(/\r\n$/,"");
 const safe=v=>{
  const s=String(v??"").replace(/[\r\n\t\u0000-\u001f]+/g," ").trim();
  return '"'+(/^[=+@-]/.test(s)&&!/^-[0-9]+,[0-9]{2}$/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';
 };
 const kr=n=>(n/100).toFixed(2).replace(".",",");
 const p=report.purchases;
 const lines=[
  [],["Inngående MVA","Kun manuelt registrerte og kontrollerte leverandørbilag – ikke komplett regnskap"],
  ["Dato","Leverandør","Dokument","Type","Grunnlag eks. MVA (kr)","MVA på bilag (kr)","Fradragsandel (%)","Fradragsført inngående MVA (kr)","Bilagsreferanse"],
  ...p.rows.map(r=>[r.date,r.supplier,r.documentNumber,
   r.kind==="credit"?"Leverandørkreditnota":"Innkjøp",kr(r.baseOre),kr(r.vatOre),
   r.deductionPercent,kr(r.deductibleVatOre),r.evidenceReference]),
  [],["Utgående MVA (kr)",kr(report.comparison.outputVatOre)],
  ["Manuelt registrert inngående MVA (kr)",kr(report.comparison.inputVatOre)],
  ["Foreløpig differanse (kr)",kr(report.comparison.differenceOre)],
  ["OBS","Differansen er ikke en fullstendig MVA-melding. Avstem alle bilag i regnskapet."]
 ];
 return "\uFEFF"+existing+"\r\n"+lines.map(row=>row.map(safe).join(";")).join("\r\n")+"\r\n";
}
