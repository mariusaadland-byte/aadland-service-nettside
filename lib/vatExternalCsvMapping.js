import {VAT_CSV_COLUMNS,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS,parseVatImportCsv} from "./vatPurchaseCsvImport";

// Import of arbitrary CSV exports remains a local, explicit mapping operation.
// No Systima API schema, tax codes, company identity or deduction rights are inferred.
const REQUIRED=["type","leverandor","fakturanummer","dokumentdato",
 "fradragsprosent","bilagsreferanse","formal"];
const VAT_RATES=[0,12,15,25];
const norm=value=>String(value??"").normalize("NFKC").trim().toLocaleLowerCase("nb-NO");
const csvQuote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
function parseWithSeparator(text,separator){
 const rows=[];let row=[],cell="",quoted=false,afterQuote=false;
 const value=String(text||"").replace(/^\uFEFF/,"");
 for(let i=0;i<value.length;i++){
  const ch=value[i];
  if(quoted){
   if(ch==='"'&&value[i+1]==='"'){cell+='"';i++;}
   else if(ch==='"'){quoted=false;afterQuote=true;}
   else cell+=ch;
  }else if(afterQuote){
   if(ch===separator){row.push(cell);cell="";afterQuote=false;}
   else if(ch==="\n"||ch==="\r"){
    if(ch==="\r"&&value[i+1]==="\n")i++;
    row.push(cell);cell="";afterQuote=false;
    if(row.some(v=>v.trim()))rows.push(row);
    row=[];
   }else if(ch!==" "&&ch!=="\t")throw Error("Ugyldig CSV – tekst etter avsluttet anførselstegn.");
  }else if(ch==='"'){
   if(cell.trim())throw Error("Ugyldig CSV – anførselstegn midt i felt.");
   cell="";quoted=true;
  }else if(ch===separator){row.push(cell);cell="";}
  else if(ch==="\n"||ch==="\r"){
   if(ch==="\r"&&value[i+1]==="\n")i++;
   row.push(cell);cell="";
   if(row.some(v=>v.trim()))rows.push(row);
   row=[];
  }else cell+=ch;
 }
 if(quoted)throw Error("Ugyldig CSV – anførselstegn er ikke avsluttet.");
 if(cell||row.length||afterQuote){
  row.push(cell);
  if(row.some(v=>v.trim()))rows.push(row);
 }
 return rows;
}
export function parseExternalVatCsv(text){
 const raw=String(text??"");
 if(!raw||new TextEncoder().encode(raw).length>MAX_VAT_CSV_BYTES)
  throw Error("Velg en CSV-fil på maks 256 KB.");
 // Compare the first header record for semicolon, comma or tab. Never parse
 // decimal commas as a separator unless fields are properly CSV-quoted.
 const candidates=[";","\t",","].map(separator=>{
  try{
   const rows=parseWithSeparator(raw,separator);
   return {separator,rows,count:rows[0]?.length||0,error:null};
  }catch(e){return {separator,rows:[],count:0,error:e};}
 });
 candidates.sort((a,b)=>b.count-a.count);
 const best=candidates[0];
 if(best.error||best.count<2)throw Error("Fant ikke en gyldig CSV-tabell med kolonneoverskrifter.");
 const {rows}=best;
 if(rows.length<2)throw Error("CSV-filen har ingen bilagsrader.");
 if(rows.length-1>MAX_VAT_IMPORT_ROWS)
  throw Error("Maks 50 bilag per import. Del opp filen.");
 const headers=rows[0].map(x=>x.trim());
 if(headers.some(x=>!x||x.length>130)||headers.length>80)
  throw Error("CSV-overskriftene er tomme eller for lange.");
 if(new Set(headers.map(norm)).size!==headers.length)
  throw Error("CSV-filen har flere kolonner med samme overskrift. Gi hver kolonne et unikt navn.");
 const data=rows.slice(1);
 for(let i=0;i<data.length;i++){
  if(data[i].length!==headers.length)
   throw Error("Rad "+(i+2)+" har "+data[i].length+" kolonner, forventet "+headers.length+
    ". Kontroller skilletegn og anførselstegn.");
 }
 return {headers,rows:data,separator:best.separator};
}
export function initialVatColumnMapping(headers){
 const lookup=new Map((headers||[]).map(h=>[norm(h),h]));
 return Object.fromEntries(VAT_CSV_COLUMNS.map(key=>[key,lookup.get(norm(key))||""]));
}
export function mapExternalVatRows(source,mapping){
 const headers=source?.headers,sourceRows=source?.rows;
 if(!Array.isArray(headers)||!Array.isArray(sourceRows)||
  !sourceRows.length||sourceRows.length>MAX_VAT_IMPORT_ROWS)
  throw Error("Ingen gyldig CSV-eksport er lastet inn.");
 if(!mapping||typeof mapping!=="object"||Array.isArray(mapping))
  throw Error("Koblingen mellom CSV-kolonnene mangler.");
 if(Object.keys(mapping).some(key=>!VAT_CSV_COLUMNS.includes(key)))
  throw Error("Ukjent målkolonne i importen.");
 const indices=new Map(headers.map((header,i)=>[header,i]));
 const selected=new Set();
 for(const col of VAT_CSV_COLUMNS){
  const from=mapping[col]||"";
  if(!from)continue;
  if(typeof from!=="string"||!indices.has(from))
   throw Error("En valgt eksportkolonne finnes ikke i filen.");
  if(selected.has(from))
   throw Error("Samme eksportkolonne kan ikke kobles til flere MVA-felt.");
  selected.add(from);
 }
 for(const required of REQUIRED)if(!mapping[required])
  throw Error("Feltet '"+required+"' må kobles manuelt før forhåndsvisning.");
 const completeRates=VAT_RATES.filter(rate=>Boolean(mapping["grunnlag_"+rate])&&
  Boolean(mapping["mva_"+rate]));
 if(completeRates.length<1)
  throw Error("Koble minst ett par med både MVA-grunnlag og MVA-beløp fra samme sats.");
 for(const rate of VAT_RATES)if(Boolean(mapping["grunnlag_"+rate])!==Boolean(mapping["mva_"+rate]))
  throw Error("Grunnlag og MVA for "+rate+" % må kobles sammen. Vi beregner ikke ukjent MVA.");
 const expected=VAT_CSV_COLUMNS.map(csvQuote).join(";");
 const lines=sourceRows.map((cells,index)=>{
  if(!Array.isArray(cells)||cells.length!==headers.length)
   throw Error("Ugyldig antall felt på rad "+(index+2));
  return VAT_CSV_COLUMNS.map(col=>csvQuote(
   mapping[col]?cells[indices.get(mapping[col])]:""
  )).join(";");
 });
 // Reuse the single official parser and existing server-side validation. This
 // maps data; it never marks the supplier evidence or deduction as approved.
 return parseVatImportCsv("\uFEFF"+expected+"\r\n"+lines.join("\r\n")+"\r\n");
}
export const VAT_CSV_IMPORT_REQUIRED=REQUIRED;
