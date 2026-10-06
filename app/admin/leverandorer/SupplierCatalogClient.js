"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import styles from "./supplierCatalog.module.css";

const money=value=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2}).format(Number(value)||0);
const normalize=value=>String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9æøå]+/g," ").trim();
const slug=value=>normalize(value).replace(/[æ]/g,"ae").replace(/[ø]/g,"o").replace(/[å]/g,"a").replace(/\s+/g,"-").slice(0,80);
const textDecoder=new TextDecoder("utf-8");

function parseDelimited(text){
 const source=String(text||"").replace(/^\uFEFF/,"");
 const firstLine=source.split(/\r?\n/,1)[0]||"";
 const sep=firstLine.includes(";")?";":firstLine.includes("\t")?"\t":",";
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='"'){
   if(quoted&&source[i+1]==='"'){cell+='"';i++}
   else quoted=!quoted;
  }else if(ch===sep&&!quoted){row.push(cell);cell=""}
  else if((ch==="\n"||ch==="\r")&&!quoted){
   if(ch==="\r"&&source[i+1]==="\n")i++;
   row.push(cell);cell="";
   if(row.some(v=>String(v).trim()))rows.push(row);
   row=[];
  }else cell+=ch;
 }
 row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);
 return rows;
}

function u16(view,offset){return view.getUint16(offset,true)}
function u32(view,offset){return view.getUint32(offset,true)}

async function unzipXlsx(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 let eocd=-1;
 for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++){
  if(u32(view,i)===0x06054b50)eocd=i;
 }
 if(eocd<0)throw new Error("Fant ikke ZIP-strukturen i Excel-filen.");
 const total=u16(view,eocd+10),centralOffset=u32(view,eocd+16);
 let offset=centralOffset;const files=new Map();
 for(let index=0;index<total;index++){
  if(u32(view,offset)!==0x02014b50)throw new Error("Ugyldig Excel/ZIP-fil.");
  const method=u16(view,offset+10),compressedSize=u32(view,offset+20);
  const nameLength=u16(view,offset+28),extraLength=u16(view,offset+30),commentLength=u16(view,offset+32);
  const localOffset=u32(view,offset+42);
  const name=textDecoder.decode(bytes.slice(offset+46,offset+46+nameLength));
  const localNameLength=u16(view,localOffset+26),localExtraLength=u16(view,localOffset+28);
  const start=localOffset+30+localNameLength+localExtraLength;
  const compressed=bytes.slice(start,start+compressedSize);
  let data;
  if(method===0)data=compressed;
  else if(method===8){
   if(typeof DecompressionStream==="undefined")throw new Error("Nettleseren støtter ikke Excel-import. Bruk CSV.");
   const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
   data=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw new Error("Excel-filen bruker en komprimering som ikke støttes.");
  files.set(name,data);
  offset+=46+nameLength+extraLength+commentLength;
 }
 return files;
}

function xmlText(bytes){
 return new DOMParser().parseFromString(textDecoder.decode(bytes),"application/xml");
}
function cellColumn(ref){
 const letters=String(ref||"").match(/^[A-Z]+/)?.[0]||"A";
 let value=0;for(const ch of letters)value=value*26+(ch.charCodeAt(0)-64);
 return value-1;
}
async function parseXlsx(file){
 const files=await unzipXlsx(await file.arrayBuffer());
 const shared=[];
 const sharedBytes=files.get("xl/sharedStrings.xml");
 if(sharedBytes){
  const doc=xmlText(sharedBytes);
  for(const si of doc.getElementsByTagName("si"))shared.push(Array.from(si.getElementsByTagName("t")).map(n=>n.textContent||"").join(""));
 }
 const sheetName=Array.from(files.keys()).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
 if(!sheetName)throw new Error("Fant ikke regnearket i Excel-filen.");
 const doc=xmlText(files.get(sheetName)),rows=[];
 for(const rowNode of doc.getElementsByTagName("row")){
  const row=[];
  for(const cell of rowNode.getElementsByTagName("c")){
   const index=cellColumn(cell.getAttribute("r")),type=cell.getAttribute("t")||"";
   let value="";
   if(type==="inlineStr")value=Array.from(cell.getElementsByTagName("t")).map(n=>n.textContent||"").join("");
   else{
    const raw=cell.getElementsByTagName("v")[0]?.textContent||"";
    value=type==="s"?shared[Number(raw)]??"":raw;
   }
   row[index]=value;
  }
  if(row.some(v=>String(v??"").trim()))rows.push(row);
 }
 return rows;
}

function number(value){
 const raw=String(value??"").trim().replace(/\s/g,"").replace(",",".");
 const n=Number(raw);return Number.isFinite(n)&&n>=0?n:0;
}
function headerIndex(headers,names,{contains=true}={}){
 const normalized=names.map(normalize);
 return headers.findIndex(h=>normalized.some(name=>h===name||(contains&&name.length>2&&h.includes(name))));
}

function mapRows(rows,priceMode){
 if(rows.length<2)return [];
 const headers=rows[0].map(normalize);
 const skuIx=headerIndex(headers,["id","sku","varenr","varenummer","artnr","artikkelnummer"],{contains:false});
 const nameIx=headerIndex(headers,["produktnavn","produkt navn","product name","navn","beskrivelse","vare"]);
 const unitIx=headerIndex(headers,["enhet","unit","uom"],{contains:false});
 const exIx=headerIndex(headers,["pris eks mva","pris eks","price ex vat","cost ex vat","nettopris","kostpris"]);
 const incIx=headerIndex(headers,["pris inkl mva","pris inkl","price inc vat","price incl vat","bruttopris"]);
 const genericPriceIx=headerIndex(headers,["pris","price"],{contains:false});
 const categoryCodeIx=headerIndex(headers,["varegruppe nummer","varegruppenummer","category code","kategori nummer"]);
 const categoryNameIx=headerIndex(headers,["varegruppetekst","varegruppe tekst","category name","kategori"]);
 const eanIx=headerIndex(headers,["ean number","ean","gtin"]);
 const moduleIx=headerIndex(headers,["modulenr","modulnr","module number","module"]);
 if(nameIx<0||Math.max(exIx,incIx,genericPriceIx)<0)throw new Error("Fant ikke produktnavn og pris-kolonner i filen.");

 return rows.slice(1).map(row=>{
  const ean=eanIx>=0?String(row[eanIx]??"").trim():"";
  const moduleNumber=moduleIx>=0?String(row[moduleIx]??"").trim():"";
  const sku=(skuIx>=0?String(row[skuIx]??"").trim():"")||ean||moduleNumber;
  const name=String(row[nameIx]??"").trim();
  let value=0,isInc=false;
  if(exIx>=0){value=number(row[exIx]);isInc=false}
  else if(incIx>=0){value=number(row[incIx]);isInc=true}
  else{value=number(row[genericPriceIx]);isInc=priceMode==="inc"}
  const exVat=isInc?value/1.25:value;
  return {
   sku,name,unit:unitIx>=0?String(row[unitIx]??"").trim():"STK",
   costExVatOre:Math.round(exVat*100),
   categoryCode:categoryCodeIx>=0?String(row[categoryCodeIx]??"").trim():"",
   categoryName:categoryNameIx>=0?String(row[categoryNameIx]??"").trim():"",
   ean,moduleNumber
  };
 }).filter(row=>row.sku&&row.name&&row.costExVatOre>0);
}

async function parseFile(file,priceMode){
 const lower=file.name.toLowerCase();
 if(lower.endsWith(".xlsx"))return mapRows(await parseXlsx(file),priceMode);
 if(lower.endsWith(".csv")||lower.endsWith(".txt")||lower.endsWith(".tsv"))return mapRows(parseDelimited(await file.text()),priceMode);
 throw new Error("Bruk Excel (.xlsx) eller CSV.");
}

export default function SupplierCatalogClient(){
 const [suppliers,setSuppliers]=useState([]);
 const [supplierId,setSupplierId]=useState("byggern");
 const [newName,setNewName]=useState("");
 const [priceMode,setPriceMode]=useState("ex");
 const [file,setFile]=useState(null);
 const [products,setProducts]=useState([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 async function load(){
  const r=await fetch("/api/admin/material-suppliers"),data=await r.json().catch(()=>({}));
  if(r.ok)setSuppliers(data.suppliers||[]);
 }
 useEffect(()=>{load().catch(()=>{})},[]);

 const selected=suppliers.find(item=>item.id===supplierId);
 const supplierName=supplierId==="__new"?newName:selected?.name||"";
 const canImport=Boolean(file&&products.length&&supplierName.trim()&&!busy);

 async function chooseFile(event){
  const next=event.target.files?.[0]||null;
  setFile(next);setProducts([]);setError("");setMessage("");
  if(!next)return;
  setBusy(true);
  try{
   const parsed=await parseFile(next,priceMode);
   setProducts(parsed);
   setMessage(parsed.length.toLocaleString("nb-NO")+" gyldige varer lest fra filen.");
  }catch(err){setError(err.message||"Prisfilen kunne ikke leses.")}
  finally{setBusy(false)}
 }
 async function reparse(){
  if(!file)return;setBusy(true);setError("");
  try{const parsed=await parseFile(file,priceMode);setProducts(parsed);setMessage(parsed.length.toLocaleString("nb-NO")+" gyldige varer lest fra filen.")}
  catch(err){setError(err.message||"Prisfilen kunne ikke leses.")}
  finally{setBusy(false)}
 }
 async function importCatalog(){
  if(!canImport)return;setBusy(true);setError("");setMessage("Lagrer prisliste…");
  try{
   const id=supplierId==="__new"?slug(newName):supplierId;
   const r=await fetch("/api/admin/material-suppliers",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({supplierId:id,supplierName:supplierName.trim(),sourceFilename:file.name,products})
   });
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Prislisten kunne ikke lagres.");
   setMessage(data.imported.toLocaleString("nb-NO")+" varer lagret for "+data.supplierName+(data.skipped?" · "+data.skipped+" linjer hoppet over":"")+".");
   setSupplierId(data.supplierId);setNewName("");setFile(null);setProducts([]);
   const input=document.getElementById("supplier-price-file");if(input)input.value="";
   await load();
  }catch(err){setError(err.message||"Prislisten kunne ikke lagres.")}
  finally{setBusy(false)}
 }

 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.header}>
   <div><Link href="/admin" className={styles.back}>← Tilbake til backoffice</Link><span className={styles.eyebrow}>AADLAND SERVICE · INTERNVERKTØY</span><h1>Leverandørpriser</h1><p>Én felles prisdatabase for Bygger’n og andre leverandører. Hver leverandør kan få ny prisliste uten at kalkulatoren må bygges om.</p></div>
   <Link href="/admin/kalkulator" className={styles.primaryLink}>Åpne kalkulator</Link>
  </header>

  {(error||message)&&<div className={error?styles.error:styles.message}>{error||message}</div>}

  <section className={styles.grid}>
   <div className={styles.card}>
    <span className={styles.step}>1 · LEVERANDØR</span>
    <h2>Velg eller legg til</h2>
    <label>Leverandør
     <select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setProducts([]);setFile(null)}}>
      {suppliers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      <option value="__new">+ Ny leverandør</option>
     </select>
    </label>
    {supplierId==="__new"&&<label>Navn på ny leverandør<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="F.eks. Montér"/></label>}
    <label>Hvis kolonnen bare heter «Pris»
     <select value={priceMode} onChange={e=>{setPriceMode(e.target.value);setTimeout(reparse,0)}}>
      <option value="ex">Prisen er eks. mva</option>
      <option value="inc">Prisen er inkl. mva</option>
     </select>
    </label>
    <p className={styles.help}>Hvis filen har en tydelig kolonne som «Pris eks. mva» eller «Pris inkl. mva», brukes den automatisk. Bygger’n-filen din kan stå på eks. mva.</p>
   </div>

   <div className={styles.card}>
    <span className={styles.step}>2 · PRISFIL</span>
    <h2>Importer eller oppdater</h2>
    <label className={styles.file}>Excel eller CSV
     <input id="supplier-price-file" type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile}/>
    </label>
    <p className={styles.help}>Gjenkjenner blant annet varenummer/ID, produktnavn, pris, enhet, varegruppe, EAN og modulnummer. En ny import erstatter aktiv prisliste for valgt leverandør først når hele filen er lagret.</p>
    {products.length>0&&<div className={styles.preview}>
     <strong>{products.length.toLocaleString("nb-NO")} varer klare</strong>
     {products.slice(0,3).map(item=><div key={item.sku}><span>{item.sku} · {item.name}</span><b>{money(item.costExVatOre/100)} eks. mva</b></div>)}
    </div>}
    <button type="button" className={styles.importButton} disabled={!canImport} onClick={importCatalog}>{busy?"Arbeider…":"Importer prisliste"}</button>
   </div>
  </section>

  <section className={styles.card}>
   <div className={styles.sectionHead}><div><span className={styles.step}>3 · REGISTRERTE LEVERANDØRER</span><h2>Prisbaser</h2></div><button type="button" className={styles.refresh} onClick={()=>load()}>Oppdater</button></div>
   <div className={styles.supplierList}>
    {suppliers.map(item=><article key={item.id}>
     <div><strong>{item.name}{item.isPrimary?" · primær":""}</strong><span>{item.productCount.toLocaleString("nb-NO")} aktive varer</span></div>
     <div><b>{item.mode}</b><small>{item.lastImportAt?"Sist importert "+new Date(item.lastImportAt).toLocaleString("nb-NO"):"Ingen prisliste importert ennå"}</small>{item.lastSourceFilename&&<small>{item.lastSourceFilename}</small>}</div>
    </article>)}
   </div>
  </section>
 </div></main>;
}
