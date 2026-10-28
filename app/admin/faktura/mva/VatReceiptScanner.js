"use client";
import {useRef,useState} from "react";
import {parseNorwegianReceipt} from "../../../../lib/vatReceiptParser";
import {recognizeVatReceiptImages} from "../../../../lib/vatReceiptRecognition";
import VatReceiptCropper from "./VatReceiptCropper";
import styles from "./VatSimpleForm.module.css";

const MAX_SIZE=4*1024*1024;
const MAX_SOURCE_SIZE=25*1024*1024;
const receiptTypes=new Set(["image/jpeg","image/png","image/webp","application/pdf","image/heic","image/heif"]);
const imageTypes=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
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
// Preserve the original file unchanged when it fits. On devices that can
// decode HEIC natively, create an explicitly labelled JPEG *copy* for upload.
// The source HEIC or oversized image must still be retained in bookkeeping.
async function prepareReceiptFile(source,onProgress){
 const extension=String(source.name||"").split(".").pop().toLowerCase();
 const type=source.type||({heic:"image/heic",heif:"image/heif",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",pdf:"application/pdf"}[extension]||"");
 if(!receiptTypes.has(type))throw Error("Velg JPG, PNG, WebP, HEIC eller PDF.");
 if(source.size<12||source.size>MAX_SOURCE_SIZE)
  throw Error("Filen er for stor eller tom. Maks 25 MB for mobilbilder.");
 if(type==="application/pdf"){
  if(source.size>MAX_SIZE)throw Error("PDF-filen er større enn 4 MB. Del opp eller lag en mindre PDF.");
  return {file:source.type?source:new File([source],source.name,{type}),converted:false};
 }
 if(source.size<=MAX_SIZE&&!["image/heic","image/heif"].includes(type))
  return {file:source.type?source:new File([source],source.name,{type}),converted:false};
 onProgress("Tilpasser bildet til mobilopplasting uten å endre originalen …");
 const url=URL.createObjectURL(source);
 let image;
 try{
  image=await new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error("Telefonen kunne ikke åpne HEIC/bildet. Prøv i Safari eller lag en JPEG-kopi i Bilder."));
   img.src=url;
  });
  const width=image.naturalWidth,height=image.naturalHeight;
  if(width<500||height<500)throw Error("Bildet er for lite til å lese godt. Ta et nytt skarpt foto.");
  let ratio=Math.min(1,2600/Math.max(width,height),Math.sqrt(8000000/(width*height)));
  const safeBase=String(source.name||"kvittering").replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,85)||"kvittering";
  for(let shrink=0;shrink<4;shrink++){
   const canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.round(width*ratio));
   canvas.height=Math.max(1,Math.round(height*ratio));
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Telefonen støtter ikke bildeforberedelse.");
   ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",Math.max(.6,.88-shrink*.08)));
   canvas.width=0;canvas.height=0;
   if(blob&&blob.size>12&&blob.size<=MAX_SIZE){
    return {file:new File([blob],safeBase+"-mobilkopi.jpg",{type:"image/jpeg"}),converted:true,
     originalName:source.name};
   }
   ratio*=.78;
  }
  throw Error("Bildet kunne ikke tilpasses til 4 MB. Prøv med et foto i lavere oppløsning.");
 }finally{URL.revokeObjectURL(url);}
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
 const recognizedText=await recognizeVatReceiptImages(tess,images,onProgress);
 return {text:recognizedText,format};

}
export default function VatReceiptScanner({onSelected,onExtracted,onBusyChange,documentType="receipt",disabled=false}){
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [details,setDetails]=useState(null);
 const [busy,setBusy]=useState(false);
 const [processedNotice,setProcessedNotice]=useState("");
 const [cropJob,setCropJob]=useState(null);
 const [imageForCrop,setImageForCrop]=useState(null);
 const scanId=useRef(0);
 async function recognizeSelected(file,meta){
  onSelected(file,meta);
  const recognized=await readLocalReceipt(file,setProgress);
  const parsed=parseNorwegianReceipt(recognized.text);
  const detectedFields=[parsed.supplierName,parsed.documentNumber,parsed.documentDate].filter(Boolean).length+
   Object.keys(parsed.groups||{}).length;
  setDetails({...parsed,format:recognized.format,preview:recognized.text.slice(0,7500),detectedFields});
  onExtracted(parsed);
  setProgress(detectedFields>0
   ?"Tekstlesing ferdig – "+detectedFields+" opplysning(er) foreslått. Kontroller dem før lagring."
   :"Fant ingen sikre opplysninger. Bruk «Juster utsnitt og les på nytt» eller fyll inn manuelt.");

 }
 async function choose(event){
  const source=event.target.files?.[0]||null;
  event.target.value="";
  if(!source||busy||disabled||cropJob)return;
  setError("");setDetails(null);setProgress("");setProcessedNotice("");setImageForCrop(null);
  // Never leave previously selected receipts associated with the new image.
  onSelected(null);
  const thisScan=++scanId.current;
  setBusy(true);onBusyChange?.(true);
  try{
   const prepared=await prepareReceiptFile(source,setProgress);
   if(thisScan!==scanId.current)return;
   const file=prepared.file;
   if(file.type!=="application/pdf")
    setImageForCrop({file,originalName:source.name,previouslyConverted:prepared.converted});
   // Start OCR immediately. Cropping is optional, not a mandatory two-step gate.
   setProgress("Bildet er valgt. Starter automatisk tekstlesing …");
   await recognizeSelected(file,{converted:prepared.converted,originalName:source.name});
  }catch(e){
   setProgress("");
   setError("Automatisk tekstlesing lyktes ikke: "+String(e.message||"ukjent feil")+
    ". Du kan justere utsnittet og prøve igjen, eller fylle inn manuelt.");
  }finally{
   setBusy(false);
   onBusyChange?.(false);
  }
 }
 async function applyCrop(croppedFile,meta){
  if(!cropJob)return;
  const original=cropJob;
  setCropJob(null);
  const copied=Boolean(meta?.cropped||original.previouslyConverted);
  const thisScan=++scanId.current;
  setBusy(true);onBusyChange?.(true);setError("");setProgress("");
  try{
   setProcessedNotice(copied
    ?"Beskjæringen er lagret som en JPEG-kopi. Behold hele originalbildet i regnskapssystemet."
    :"Hele originalbildet er beholdt uendret som bilag.");
   await recognizeSelected(croppedFile,{converted:copied,originalName:original.originalName});
   if(thisScan!==scanId.current)return;
   setImageForCrop(null);
  }catch(e){
   setProgress("");
   setError("Kvitteringen er valgt som vedlegg, men teksten kunne ikke leses: "+String(e.message||"ukjent feil")+
    ". Du kan likevel fylle inn feltene manuelt.");
  }finally{setBusy(false);onBusyChange?.(false);}
 }
 function cancelCrop(){
  setCropJob(null);setError("");setProgress("");setBusy(false);
  onBusyChange?.(false);
 }

 return <section className={styles.scanShell}>
  <h3>{documentType==="invoice"?"Last opp faktura":"1. Legg til kvittering"}</h3>
  <p className={styles.scanLead}>Ta bilde eller velg en fil. Vi forsøker å fylle ut feltene automatisk.</p>
  <div className={styles.uploadActions}>
   <label className={styles.uploadAction}>📷 Ta bilde
    <input aria-label="Ta bilde av kvittering" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
     disabled={disabled||busy||Boolean(cropJob)} onChange={choose}/>
   </label>
   <label className={styles.uploadAction}>📁 Velg bilde / PDF
    <input aria-label="Velg kvittering fra telefonen" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp"
     disabled={disabled||busy||Boolean(cropJob)} onChange={choose}/>
   </label>
  </div>
  <details className={styles.scanHelp}>
   <summary>Filstørrelse og hvordan lesingen virker</summary>
   <p>PDF maks 4 MB, bilder opptil 25 MB. Vi foreslår et utsnitt du kan justere før lesingen starter. OCR kjøres på telefonen, mens leseprogram og språkfiler lastes fra en ekstern leverandør. Ved beskjæring lagres en JPEG-kopi; behold originalen i regnskapet.</p>
  </details>
  {imageForCrop&&!cropJob&&<button type="button" className={styles.textAction} disabled={disabled||busy}
   onClick={()=>{setCropJob(imageForCrop);setError("");setProgress("");}}>
   Juster utsnitt og les på nytt
  </button>}
  {cropJob&&<VatReceiptCropper file={cropJob.file} onApply={applyCrop} onCancel={cancelCrop} disabled={busy||disabled}/>}
  {!cropJob&&busy&&<p role="status" className={styles.scanMessage}>Bildet leses automatisk. Feltene fylles ut når lesingen er ferdig.</p>}
  {processedNotice&&<p role="note" className={styles.scanMessage}>{processedNotice}</p>}
  {(busy||progress)&&<p role="status" className={styles.scanMessage}><strong>{progress||"Klargjør lesing …"}</strong></p>}
  {error&&<p role="alert" className={styles.scanMessage} style={{color:"#a52a21"}}>{error}</p>}
  {details&&<div className={styles.scanResult}>
   <strong>{details.detectedFields>0?"Fylte ut "+details.detectedFields+" opplysninger automatisk":"Ingen sikre felt ble fylt ut"}</strong>
   <p>{documentType==="invoice"?details.documentNumber||"Fakturanummer ikke funnet":details.supplierName||"Leverandør ikke funnet"} · {details.documentDate||"Dato ikke funnet"} · {details.totalOre==null?"Sum ikke funnet":new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(details.totalOre/100)}</p>
   {details.warnings.length>0&&<ul>{details.warnings.map((warn,i)=><li key={i}>{warn}</li>)}</ul>}
   <details><summary>Vis lest tekst</summary>
    <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:230,overflow:"auto",fontSize:11}}>{details.preview}</pre>
   </details>
  </div>}
 </section>;
}
