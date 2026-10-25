"use client";
import {useRef,useState} from "react";
import {parseNorwegianReceipt} from "../../../../lib/vatReceiptParser";

const MAX_SIZE=4*1024*1024;
const TESSERACT_URL="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const PDFJS_URL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const scripts=new Map();
function loadScript(url,globalKey){
 if(typeof window!=="undefined"&&window[globalKey])return Promise.resolve(window[globalKey]);
 if(scripts.has(url))return scripts.get(url);
 const promise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=url;script.async=true;script.crossOrigin="anonymous";
  script.onload=()=>window[globalKey]?resolve(window[globalKey]):reject(Error("Lesemodulen ble ikke lastet."));
  script.onerror=()=>reject(Error("Kunne ikke laste lesemodulen. Sjekk internettilkoblingen."));
  document.head.appendChild(script);
 }).catch(error=>{scripts.delete(url);throw error});
 scripts.set(url,promise);
 return promise;
}
async function imageFromPdf(file,onProgress){
 const pdfjs=await loadScript(PDFJS_URL,"pdfjsLib");
 pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
 const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 try{
  const pageCount=Math.min(document.numPages,3);
  let text="";
  for(let i=1;i<=pageCount;i++){
   onProgress("Leser PDF-side "+i+" av "+pageCount+" …");
   const page=await document.getPage(i);
   const {items}=await page.getTextContent();
   text+="\n"+items.map(item=>item.str+(item.hasEOL?"\n":" ")).join("");
  }
  if(text.replace(/\s/g,"").length>=45)return {text,format:"pdf-tekst"};
  const images=[];
  for(let i=1;i<=Math.min(document.numPages,2);i++){
   const page=await document.getPage(i);
   const viewport=page.getViewport({scale:1});
   const scale=Math.min(2.1,1600/Math.max(viewport.width,viewport.height));
   const v=page.getViewport({scale});
   const canvas=document.createElement("canvas");
   canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Kan ikke tegne PDF-siden på denne telefonen.");
   await page.render({canvasContext:ctx,viewport:v}).promise;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
   canvas.width=0;canvas.height=0;
   if(blob)images.push(blob);
  }
  return {images,format:"pdf-skann"};
 }finally{await document.destroy();}
}
async function readLocalReceipt(file,onProgress){
 let text="",format="bilde";
 let images=[file];
 if(file.type==="application/pdf"){
  const pdf=await imageFromPdf(file,onProgress);
  if(pdf.text)return {text:pdf.text,format:pdf.format};
  images=pdf.images;format="pdf-skann";
 }
 const tess=await loadScript(TESSERACT_URL,"Tesseract");
 let worker;
 try{
  onProgress("Laster norsk kvitteringsleser …");
  worker=await tess.createWorker("nor+eng",1,{logger:message=>{
   if(message?.status==="recognizing text")onProgress("Leser kvitteringen: "+Math.round((message.progress||0)*100)+" %");
  }});
  for(let i=0;i<images.length;i++){
   onProgress("Leser "+(i+1)+" av "+images.length+" side(r) …");
   const result=await worker.recognize(images[i]);
   text+="\n"+String(result?.data?.text||"");
  }
  return {text,format};
 }finally{if(worker)await worker.terminate();}
}
export default function VatReceiptScanner({onSelected,onExtracted,disabled=false}){
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [details,setDetails]=useState(null);
 const [busy,setBusy]=useState(false);
 const scanId=useRef(0);
 async function choose(event){
  const file=event.target.files?.[0]||null;
  event.target.value="";
  if(!file||busy||disabled)return;
  setError("");setDetails(null);setProgress("");
  if(file.size<12||file.size>MAX_SIZE){
   setError("Bildet eller PDF-en må være maks 4 MB. Velg en mindre fil, eller lag en mindre JPEG-kopi.");
   return;
  }
  if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)){
   setError("Bruk JPG, PNG, WebP eller PDF. iPhone-bilder i HEIC må først lagres som JPEG.");
   return;
  }
  const thisScan=++scanId.current;
  onSelected(file);
  setBusy(true);
  try{
   const recognized=await readLocalReceipt(file,setProgress);
   if(thisScan!==scanId.current)return;
   const parsed=parseNorwegianReceipt(recognized.text);
   setDetails({...parsed,format:recognized.format,preview:recognized.text.slice(0,7500)});
   onExtracted(parsed);
   setProgress("Teksten er lest. Kontroller forslagene nedenfor før lagring.");
  }catch(e){
   setProgress("");
   setError("Automatisk lesing lyktes ikke: "+String(e.message||"ukjent feil")+
    " Filen er likevel valgt som vedlegg. Fyll inn feltene manuelt før du lagrer.");
  }finally{setBusy(false);}
 }
 return <section style={{border:"1px solid #c8d7d2",background:"#f4faf8",borderRadius:14,padding:15,margin:"16px 0"}}>
  <h3 style={{margin:"0 0 7px"}}>1. Ta bilde eller velg kvittering</h3>
  <p style={{fontSize:13,margin:"0 0 12px"}}>
   Vi leser kvitteringens tekst på telefonen når det er mulig. Originalfilen lastes først opp privat etter at du har kontrollert og registrert bilaget.
  </p>
  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
   <label style={{flex:"1 1 150px",fontWeight:700}}>📷 Ta bilde
    <input aria-label="Ta bilde av kvittering" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
     disabled={disabled||busy} onChange={choose} style={{display:"block",width:"100%",marginTop:7,fontSize:13}}/>
   </label>
   <label style={{flex:"1 1 150px",fontWeight:700}}>📁 Velg bilde eller PDF
    <input aria-label="Velg kvittering fra telefonen" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
     disabled={disabled||busy} onChange={choose} style={{display:"block",width:"100%",marginTop:7,fontSize:13}}/>
   </label>
  </div>
  <p style={{fontSize:12,color:"#49645c"}}>Maks 4 MB. OCR foregår lokalt i nettleseren. Lesemotor og språkfiler hentes fra en ekstern leverandør; selve bildet sendes ikke dit for lesing.</p>
  {(busy||progress)&&<p role="status" style={{fontWeight:650}}>{progress||"Klargjør lesing …"}</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {details&&<div style={{fontSize:13,borderTop:"1px solid #d9e5e0",paddingTop:10}}>
   <strong>Fant tekst ({details.format}).</strong>
   <p>Forslag: {details.supplierName||"leverandør ukjent"} · {details.documentDate||"dato ukjent"} · {details.totalOre==null?"beløp ukjent":new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(details.totalOre/100)}</p>
   {details.warnings.length>0&&<ul>{details.warnings.map((warn,i)=><li key={i}>{warn}</li>)}</ul>}
   <details><summary>Se lest tekst for manuell kontroll</summary>
    <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:230,overflow:"auto",fontSize:11}}>{details.preview}</pre>
   </details>
  </div>}
 </section>;
}
