import {parseKronerOre,validInvoiceDay} from "./invoiceInputVat";
const rates=[0,12,15,25];
const emptyVat=()=>Object.fromEntries(rates.map(rate=>[rate,{baseOre:0,vatOre:0}]));
const safeNumber=n=>Number.isSafeInteger(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
export function validateVatExternalSale(input){
 const customerName=String(input?.customerName||"").trim();
 const sourceSystem=String(input?.sourceSystem||"").trim();
 const documentNumber=String(input?.documentNumber||"").trim();
 const documentDate=String(input?.documentDate||"");
 const kind=String(input?.kind||"");
 const originalDocumentNumber=String(input?.originalDocumentNumber||"").trim();
 if(customerName.length<2||customerName.length>160)throw Error("Fyll inn kundens navn.");
 if(sourceSystem.length<2||sourceSystem.length>100)throw Error("Oppgi navnet på det tidligere fakturasystemet.");
 if(documentNumber.length<1||documentNumber.length>90)throw Error("Fyll inn fakturanummeret fra det tidligere systemet.");
 if(!validInvoiceDay(documentDate))throw Error("Fakturaen må ha en gyldig dokumentdato.");
 if(!["invoice","credit"].includes(kind))throw Error("Velg kundefaktura eller kreditnota.");
 if(kind==="credit"&&(originalDocumentNumber.length<1||originalDocumentNumber.length>90))
  throw Error("Kreditnotaen må oppgi opprinnelig fakturanummer.");
 if(input?.documentConfirmed!==true||input?.notDuplicateConfirmed!==true)
  throw Error("Kontroller originaldokument og at det ikke allerede er registrert i Aadland Service.");
 const src=input?.groups;
 if(!src||typeof src!=="object"||Array.isArray(src)||
   Object.keys(src).some(key=>!rates.includes(Number(key))))
  throw Error("Velg gyldige MVA-satser (0, 12, 15 eller 25 %).");
 const groups={};let baseOre=0,vatOre=0;
 for(const rate of rates){
  const line=src[rate]||src[String(rate)]||{};
  const baseRaw=String(line.base??"").trim(),vatRaw=String(line.vat??"").trim();
  if(!baseRaw&&!vatRaw)continue;
  const net=parseKronerOre(baseRaw||"0"),tax=parseKronerOre(vatRaw||"0");
  if(net<=0||Math.abs(tax-Math.round(net*rate/100))>5)
   throw Error("MVA på "+rate+" % stemmer ikke med dokumentet (maks 5 øre avvik).");
  baseOre+=net;vatOre+=tax;groups[rate]={baseOre:net,vatOre:tax};
 }
 if(baseOre<=0||![baseOre,vatOre,baseOre+vatOre].every(safeNumber))
  throw Error("Fyll inn et gyldig salgsbeløp fra kundefakturaen.");
 return {customer_name:customerName,source_system:sourceSystem,
  document_number:documentNumber,document_date:documentDate,kind,
  original_document_number:kind==="credit"?originalDocumentNumber:null,
  vat_groups:groups,base_ore:baseOre,vat_ore:vatOre};
}
export function calculateExternalSalesSummary(documents,period){
 const from=period.from,to=period.to;
 const vat=emptyVat(),rows=[];
 let invoiceCount=0,creditCount=0,baseOre=0,vatOre=0,grossOre=0;
 for(const doc of documents||[]){
  if(doc.voided_at)continue;
  if(!validInvoiceDay(doc.document_date)||doc.document_date<from||doc.document_date>to)
   throw Error("Tidligere kundefaktura med ugyldig dokumentdato eller termin.");
  const factor=doc.kind==="credit"?-1:doc.kind==="invoice"?1:0;
  if(!factor)throw Error("Ugyldig ekstern fakturatype.");
  const groups=doc.vat_groups||{};
  let documentBase=0,documentVat=0;
  for(const [key,line] of Object.entries(groups)){
   const rate=Number(key),net=Number(line?.baseOre),tax=Number(line?.vatOre);
   if(!rates.includes(rate)||![net,tax].every(Number.isSafeInteger)||net<0||tax<0||
      Math.abs(tax-Math.round(net*rate/100))>5)
    throw Error("Tidligere faktura har MVA-linjer som ikke kan avstemmes.");
   documentBase+=net;documentVat+=tax;
   vat[rate].baseOre+=factor*net;vat[rate].vatOre+=factor*tax;
  }
  if(documentBase<=0||documentBase!==Number(doc.base_ore)||documentVat!==Number(doc.vat_ore))
   throw Error("Tidligere faktura har avvik mellom MVA-satsene og totalsummen.");
  if(!validInvoiceDay(doc.document_date)||!doc.id||!doc.document_number||!doc.source_system)
   throw Error("Tidligere faktura mangler dokumentasjon.");
  baseOre+=factor*documentBase;vatOre+=factor*documentVat;
  grossOre+=factor*(documentBase+documentVat);
  if(factor===1)invoiceCount++;else creditCount++;
  rows.push({key:"external:"+doc.id,invoiceId:null,externalDocumentId:doc.id,
   documentNumber:doc.document_number,documentDate:doc.document_date,
   kind:factor===1?"external_invoice":"external_credit",
   kindLabel:factor===1?"Importert kundefaktura":"Importert kreditnota",
   invoiceNumberReference:doc.original_document_number||"",
   customerName:doc.customer_name,sourceSystem:doc.source_system,
   baseOre:factor*documentBase,vatOre:factor*documentVat,
   totalOre:factor*(documentBase+documentVat),
   vat:Object.fromEntries(rates.map(rate=>[rate,{baseOre:factor*(groups[rate]?.baseOre||0),vatOre:factor*(groups[rate]?.vatOre||0)}]))});
 }
 if(![baseOre,vatOre,grossOre].every(safeNumber)||baseOre+vatOre!==grossOre)
  throw Error("Eksterne fakturaer kan ikke avstemmes.");
 return {rows,vat,invoiceCount,creditCount,baseOre,vatOre,grossOre};
}

export function mergeExternalVatReport(report,external){
 if(!report||!external)throw Error("Eksterne salgsbilag kunne ikke lastes.");
 const rates=[0,12,15,25];
 const total={...report.total,vat:Object.fromEntries(rates.map(rate=>[
  rate,{baseOre:report.total.vat[rate].baseOre+external.vat[rate].baseOre,
   vatOre:report.total.vat[rate].vatOre+external.vat[rate].vatOre}
 ]))};
 total.invoiceCount+=external.invoiceCount;total.creditCount+=external.creditCount;
 total.baseOre+=external.baseOre;total.vatOre+=external.vatOre;total.grossOre+=external.grossOre;
 total.invoiceGrossOre+=external.rows.filter(row=>row.kind==="external_invoice").reduce((sum,row)=>sum+row.totalOre,0);
 total.creditedGrossOre+=external.rows.filter(row=>row.kind==="external_credit").reduce((sum,row)=>sum-row.totalOre,0);
 const rows=[...report.rows,...external.rows].sort((a,b)=>a.documentDate.localeCompare(b.documentDate)||a.documentNumber.localeCompare(b.documentNumber));
 if(![total.baseOre,total.vatOre,total.grossOre].every(Number.isSafeInteger)||
    total.baseOre+total.vatOre!==total.grossOre)
  throw Error("Salg og importerte fakturaer kan ikke avstemmes.");
 for(const rate of rates){
  if(![total.vat[rate].baseOre,total.vat[rate].vatOre].every(Number.isSafeInteger))
   throw Error("For store beløp i MVA-avstemmingen.");
 }
 const outputVatOre=total.vatOre;
 const differenceOre=outputVatOre-report.comparison.inputVatOre;
 if(!Number.isSafeInteger(differenceOre))throw Error("Ugyldig MVA-differanse.");
 return {...report,total,rows,externalSales:external,comparison:{
  ...report.comparison,outputVatOre,differenceOre,isComplete:false,
  warning:"Foreløpig beregning med registrerte salg, eldre importerte kundefakturaer og manuelt registrerte kjøp. Ikke en ferdig MVA-melding."
 }};
}
