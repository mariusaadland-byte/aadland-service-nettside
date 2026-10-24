import {validateVatPurchaseInput} from "./invoiceInputVat";

export const VAT_CSV_COLUMNS=[
 "type","leverandor","fakturanummer","dokumentdato","opprinnelig_faktura",
 "grunnlag_25","mva_25","grunnlag_15","mva_15",
 "grunnlag_12","mva_12","grunnlag_0","mva_0",
 "fradragsprosent","bilagsreferanse","formal"
];
export const MAX_VAT_CSV_BYTES=256*1024;
export const MAX_VAT_IMPORT_ROWS=50;
const normalized=value=>String(value??"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("nb-NO");
const key=row=>[normalized(row.supplierName),normalized(row.documentNumber),row.kind].join("\u001f");
const prefix=row=>[normalized(row.supplierName),normalized(row.documentNumber)].join("\u001f");

// Standard Aadland CSV template, not a promise that arbitrary Systima export
// fields are supported. Never silently infer tax codes or deduction rights.
function parseDelimitedCsv(text){
 const rows=[];let row=[],value="",quoted=false;
 const input=String(text??"").replace(/^\uFEFF/,"");
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quoted){
   if(char==='"'&&input[i+1]==='"'){value+='"';i++;}
   else if(char==='"')quoted=false;
   else value+=char;
  }else if(char==='"'){
   if(value!=="")throw Error("Ugyldig anførselstegn i CSV. Bruk doble anførselstegn rundt hele feltet.");
   quoted=true;
  }else if(char===";"){
   row.push(value);value="";
  }else if(char==="\n"||char==="\r"){
   if(char==="\r"&&input[i+1]==="\n")i++;
   row.push(value);value="";
   if(row.some(field=>String(field).trim()!==""))rows.push(row);
   row=[];
  }else value+=char;
 }
 if(quoted)throw Error("CSV-filen har et anførselstegn som ikke er avsluttet.");
 if(value!==""||row.length){row.push(value);if(row.some(v=>String(v).trim()!==""))rows.push(row);}
 return rows;
}
const isoDate=date=>{
 const value=String(date??"").trim();
 const match=value.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
 return match?match[3]+"-"+match[2]+"-"+match[1]:value;
};
export function parseVatImportCsv(text){
 const value=String(text??"");
 if(!value||new TextEncoder().encode(value).length>MAX_VAT_CSV_BYTES)
  throw Error("Velg en ikke-tom CSV-fil på maks 256 KB.");
 const lines=parseDelimitedCsv(value);
 if(lines.length<2)throw Error("CSV-filen mangler bilagsrader.");
 if(lines.length-1>MAX_VAT_IMPORT_ROWS)
  throw Error("Maks 50 bilag per forhåndsvisning. Del opp eksportfilen.");
 const head=lines[0].map(v=>String(v).trim().toLowerCase());
 if(head.length!==VAT_CSV_COLUMNS.length||
  head.some((h,i)=>h!==VAT_CSV_COLUMNS[i]))
  throw Error("CSV-kolonnene stemmer ikke med Aadland-malen. Last ned malen og kopier inn data i samme kolonnerekkefølge.");
 return lines.slice(1).map((cells,i)=>{
  if(cells.length!==VAT_CSV_COLUMNS.length)
   throw Error("CSV-rad "+(i+2)+" har "+cells.length+" kolonner, forventet "+VAT_CSV_COLUMNS.length+".");
  const item=Object.fromEntries(VAT_CSV_COLUMNS.map((h,k)=>[h,String(cells[k]||"").trim()]));
  const type=normalized(item.type);
  const kind=["faktura","purchase","kjøp","kjopsfaktura","kjøpsfaktura"].includes(type)?"purchase":
   ["kreditnota","credit","kredit"].includes(type)?"credit":item.type;
  return {
   supplierName:item.leverandor,documentNumber:item.fakturanummer,
   documentDate:isoDate(item.dokumentdato),kind,
   originalDocumentNumber:item.opprinnelig_faktura,
   evidenceReference:item.bilagsreferanse,businessPurpose:item.formal,
   deductionPercent:item.fradragsprosent,
   groups:Object.fromEntries([25,15,12,0].map(rate=>[rate,{
    base:item["grunnlag_"+rate],vat:item["mva_"+rate]
   }])),
   // Import needs a *separate* owner acknowledgement before write.
   documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false
  };
 });
}
export function vatCsvTemplate(){
 const example=[
 "faktura","Eksempelleverandør AS","2026-123","24.10.2026","",
 "1000,00","250,00","","","","","","",
 "100","Regnskap bilag 123","Materialer til kundeoppdrag"
 ];
 const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
 return "\uFEFF"+VAT_CSV_COLUMNS.map(quote).join(";")+"\r\n"+
  example.map(quote).join(";")+"\r\n";
}
export function inspectVatImportRows(rows,existing){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_VAT_IMPORT_ROWS)
  throw Error("Velg mellom 1 og 50 bilag.");
 const existingByKey=new Map(),sameNumber=new Map();
 for(const doc of existing||[]){
  if(doc.voided_at)continue;
  const source={supplierName:doc.supplier_name,documentNumber:doc.supplier_document_number,kind:doc.kind};
  const k=key(source),p=prefix(source);
  existingByKey.set(k,doc);
  if(!sameNumber.has(p))sameNumber.set(p,[]);
  sameNumber.get(p).push(doc);
 }
 const parsed=rows.map((raw,index)=>{
  const result={index,status:"new",message:"Ny – kan godkjennes etter dokumentkontroll",document:null,
   raw};
  try{
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Ugyldig CSV-rad.");
   if(String(raw.deductionPercent??"").trim()==="")
    throw Error("Fradragsprosent mangler. Velg en kontrollert andel, for eksempel 0 eller 100.");
   const input={...raw,documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:true};
   const doc=validateVatPurchaseInput(input);
   result.document=doc;
   result.requiresBankCheck=doc.kind==="purchase"&&doc.base_ore+doc.vat_ore>=1000000;
   result.key=key({supplierName:doc.supplier_name,documentNumber:doc.supplier_document_number,kind:doc.kind});
   result.numberKey=prefix({supplierName:doc.supplier_name,documentNumber:doc.supplier_document_number});
   if(normalized(doc.supplier_name)===normalized("Eksempelleverandør AS")&&
      normalized(doc.supplier_document_number)==="2026-123"){
    result.status="invalid";
    result.message="Dette er eksempelet fra CSV-malen. Slett raden før import.";
    return result;
   }
   const old=existingByKey.get(result.key);
   if(old){
    const sameAmount=Number(old.base_ore)===doc.base_ore&&Number(old.vat_ore)===doc.vat_ore&&
     Number(old.deductible_vat_ore)===doc.deductible_vat_ore&&
     String(old.document_date)===doc.document_date;
    result.status=sameAmount?"existing":"conflict";
    result.message=sameAmount?"Finnes allerede – skal ikke importeres":
      "Konflikt med registrert bilag – dato eller beløp er forskjellig";
   }else if(sameNumber.get(result.numberKey)?.length){
    result.status="review";
    result.message="Samme leverandør og nummer finnes med en annen bilagstype. Kontroller manuelt.";
   }
  }catch(e){
   result.status="invalid";result.message=e.message||"Ugyldig bilag";
  }
  return result;
 });
 const occurrences=new Map();
 for(const item of parsed){
  if(!item.key)continue;
  if(!occurrences.has(item.key))occurrences.set(item.key,[]);
  occurrences.get(item.key).push(item);
 }
 for(const group of occurrences.values()){
  if(group.length>1)for(const item of group){
   item.status="duplicateInFile";
   item.message="Duplikat i importfilen – fjern eller korriger alle kopiene før import.";
  }
 }
 // Keep preview response compact and avoid returning raw references needlessly.
 return parsed.map(({index,status,message,document,requiresBankCheck})=>({
  index,status,message,requiresBankCheck:Boolean(requiresBankCheck),
  ...(document?{
   supplierName:document.supplier_name,documentNumber:document.supplier_document_number,
   documentDate:document.document_date,kind:document.kind,
   baseOre:document.base_ore,vatOre:document.vat_ore,
   deductibleVatOre:document.deductible_vat_ore
  }:{})
 }));
}
