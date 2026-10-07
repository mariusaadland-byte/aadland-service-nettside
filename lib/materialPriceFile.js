import "server-only";
import {inflateRawSync} from "node:zlib";

const MAX_ROWS=50000;

function decodeXml(value=""){
 return String(value)
  .replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
  .replace(/&#([0-9]+);/g,(_,num)=>String.fromCodePoint(parseInt(num,10)))
  .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
}
function columnIndex(ref){
 let n=0;
 for(const ch of String(ref||"").toUpperCase()){
  if(ch<"A"||ch>"Z")break;
  n=n*26+(ch.charCodeAt(0)-64);
 }
 return Math.max(0,n-1);
}
function readZipEntries(input){
 const buffer=Buffer.isBuffer(input)?input:Buffer.from(input);
 const min=Math.max(0,buffer.length-22-65535);
 let eocd=-1;
 for(let i=buffer.length-22;i>=min;i--){
  if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break}
 }
 if(eocd<0)throw new Error("Excel-filen er ikke en gyldig XLSX-fil.");
 const count=buffer.readUInt16LE(eocd+10);
 const centralOffset=buffer.readUInt32LE(eocd+16);
 let pos=centralOffset;
 const wanted={};
 for(let i=0;i<count;i++){
  if(buffer.readUInt32LE(pos)!==0x02014b50)throw new Error("Excel-filen har en ugyldig ZIP-struktur.");
  const method=buffer.readUInt16LE(pos+10);
  const compressedSize=buffer.readUInt32LE(pos+20);
  const nameLength=buffer.readUInt16LE(pos+28);
  const extraLength=buffer.readUInt16LE(pos+30);
  const commentLength=buffer.readUInt16LE(pos+32);
  const localOffset=buffer.readUInt32LE(pos+42);
  const name=buffer.subarray(pos+46,pos+46+nameLength).toString("utf8");
  if(name==="xl/sharedStrings.xml"||(name.startsWith("xl/worksheets/sheet")&&name.endsWith(".xml"))){
   if(buffer.readUInt32LE(localOffset)!==0x04034b50)throw new Error("Excel-filen har en ugyldig lokal ZIP-post.");
   const localNameLength=buffer.readUInt16LE(localOffset+26);
   const localExtraLength=buffer.readUInt16LE(localOffset+28);
   const start=localOffset+30+localNameLength+localExtraLength;
   const raw=buffer.subarray(start,start+compressedSize);
   if(method===0)wanted[name]=raw;
   else if(method===8)wanted[name]=inflateRawSync(raw);
   else throw new Error("Excel-filen bruker en komprimering som ikke støttes.");
  }
  pos+=46+nameLength+extraLength+commentLength;
 }
 return wanted;
}
function parseXlsx(input){
 const entries=readZipEntries(input);
 const sharedXml=entries["xl/sharedStrings.xml"]?.toString("utf8")||"";
 const shared=[];
 for(const match of sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)){
  const parts=[...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>decodeXml(x[1]));
  shared.push(parts.join(""));
 }
 const sheetName=Object.keys(entries)
  .filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  .sort((a,b)=>Number(a.match(/sheet(\d+)/)?.[1]||0)-Number(b.match(/sheet(\d+)/)?.[1]||0))[0];
 if(!sheetName)throw new Error("Fant ikke noe regneark i Excel-filen.");
 const xml=entries[sheetName].toString("utf8");
 const matrix=[];
 for(const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)){
  const row=[];
  for(const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)){
   const attrs=cellMatch[1];
   const body=cellMatch[2];
   const ref=(attrs.match(/\br="([^"]+)"/)||[])[1]||"A1";
   const type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||"";
   let value="";
   if(type==="inlineStr"){
    value=decodeXml([...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(""));
   }else{
    const raw=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1]??"";
    value=type==="s"?(shared[Number(raw)]??""):decodeXml(raw);
   }
   row[columnIndex(ref)]=value;
  }
  matrix.push(row);
  if(matrix.length>MAX_ROWS+1)throw new Error("Prisfilen har for mange rader. Maks er 50 000 produkter per import.");
 }
 return matrix;
}
function parseDelimited(text){
 const input=String(text||"").replace(/^\uFEFF/,"");
 const first=(input.split(/\r?\n/,1)[0]||"");
 const candidates=[";","\t",","];
 const delimiter=candidates.map(d=>[d,(first.match(new RegExp(d==="\t"?"\\t":`\\${d}`,"g"))||[]).length]).sort((a,b)=>b[1]-a[1])[0]?.[0]||",";
 const rows=[];
 let row=[],field="",quoted=false;
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(quoted){
   if(ch==='"'&&input[i+1]==='"'){field+='"';i++}
   else if(ch==='"')quoted=false;
   else field+=ch;
  }else if(ch==='"')quoted=true;
  else if(ch===delimiter){row.push(field);field=""}
  else if(ch==="\n"){row.push(field.replace(/\r$/,""));rows.push(row);row=[];field=""}
  else field+=ch;
 }
 if(field.length||row.length){row.push(field.replace(/\r$/,""));rows.push(row)}
 return rows.slice(0,MAX_ROWS+1);
}
function headerKey(value){
 return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9æøå]+/g,"");
}
const ALIASES={
 sku:["id","varenr","varenummer","artnr","artikkelnummer","produktid","sku","itemnumber","productid"],
 name:["produktnavn","produkt","varenavn","navn","beskrivelse","description","productname","name"],
 price:["pris","priseksmva","prisexmva","nettopris","innkjopspris","kostpris","price","priceexvat","costexvat","netprice"],
 unit:["enhet","unit","uom","prisenhet","salgenhet"],
 categoryCode:["varegruppenummer","varegruppeid","kategorinummer","categorycode","categoryid"],
 categoryName:["varegruppetekst","varegruppe","kategori","category","categoryname"],
 ean:["eannumber","ean","gtin","strekkode","barcode"],
 moduleNumber:["modulenr","modulnummer","modulenumber","module"]
};
function findColumn(headers,aliases){
 const normalized=headers.map(headerKey);
 return normalized.findIndex(value=>aliases.includes(value));
}
function parsePrice(value){
 const raw=String(value??"").trim().replace(/\s/g,"").replace(/kr/gi,"");
 if(!raw)return NaN;
 let normalized=raw;
 if(raw.includes(",")&&raw.includes(".")){
  normalized=raw.lastIndexOf(",")>raw.lastIndexOf(".")?raw.replace(/\./g,"").replace(",","."):raw.replace(/,/g,"");
 }else if(raw.includes(","))normalized=raw.replace(",",".");
 const n=Number(normalized);
 return Number.isFinite(n)?n:NaN;
}

export function parseMaterialPriceFile(buffer,filename,{priceIncludesVat=false}={}){
 const lower=String(filename||"").toLowerCase();
 let rows;
 if(lower.endsWith(".xlsx"))rows=parseXlsx(buffer);
 else if(lower.endsWith(".csv")||lower.endsWith(".txt")||lower.endsWith(".tsv"))rows=parseDelimited(Buffer.from(buffer).toString("utf8"));
 else throw new Error("Bruk XLSX, CSV, TSV eller TXT som prisfil.");

 rows=rows.filter(row=>Array.isArray(row)&&row.some(value=>String(value??"").trim()!==""));
 if(rows.length<2)throw new Error("Prisfilen inneholder ingen produktlinjer.");

 const headers=rows[0].map(value=>String(value??"").trim());
 const columns={};
 for(const [key,aliases] of Object.entries(ALIASES))columns[key]=findColumn(headers,aliases);
 const missing=[];
 if(columns.sku<0)missing.push("varenummer/ID");
 if(columns.name<0)missing.push("produktnavn");
 if(columns.price<0)missing.push("pris");
 if(columns.unit<0)missing.push("enhet");
 if(missing.length)throw new Error("Kjenner ikke igjen kolonnene for "+missing.join(", ")+". Fant: "+headers.filter(Boolean).join(", "));

 const products=[];
 let skipped=0;
 for(const row of rows.slice(1)){
  const sku=String(row[columns.sku]??"").trim();
  const name=String(row[columns.name]??"").trim();
  const unit=String(row[columns.unit]??"").trim()||"STK";
  const price=parsePrice(row[columns.price]);
  if(!sku||!name||!Number.isFinite(price)||price<0){skipped++;continue}
  const ex=priceIncludesVat?price/1.25:price;
  products.push({
   supplier_sku:sku.slice(0,160),
   name:name.slice(0,500),
   cost_ex_vat_ore:Math.round(ex*100),
   unit:unit.slice(0,40),
   category_code:columns.categoryCode>=0?String(row[columns.categoryCode]??"").trim().slice(0,120):"",
   category_name:columns.categoryName>=0?String(row[columns.categoryName]??"").trim().slice(0,300):"",
   ean:columns.ean>=0?String(row[columns.ean]??"").trim().slice(0,80):"",
   module_number:columns.moduleNumber>=0?String(row[columns.moduleNumber]??"").trim().slice(0,120):""
  });
 }
 if(!products.length)throw new Error("Fant ingen gyldige produkter i prisfilen.");
 return {products,headers,skipped};
}
