"use client";
import {useEffect,useRef,useState} from "react";
import {parseNorwegianReceipt} from "../../../../lib/vatReceiptParser";
import {createVatReceiptReader} from "../../../../lib/vatReceiptRecognition";
import {prepareVatOcrImage} from "../../../../lib/vatOcrImage";
import {needsVatReceiptRetry,chooseVatReceiptScan} from "../../../../lib/vatReceiptQuality";
import VatReceiptCropper from "./VatReceiptCropper";
import VatReceiptLiveCamera from "./VatReceiptLiveCamera";
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

async function readLocalReceipt(file,onProgress,readerRef,options={}){
 let format="bilde",images=[file];
 if(file.type==="application/pdf"){
  const pdf=await imageFromPdf(file,onProgress);
  if(pdf.text)return {text:pdf.text,format:pdf.format,confidence:null};
  images=pdf.images;format="pdf-skann";
 }
 const tess=await loadScript(TESSERACT_URL,"Tesseract");
 // Keep the worker alive within this page: models need not be downloaded and
 // initialized for every receipt photo. Dispose when leaving the page.
 if(!readerRef.current)readerRef.current=createVatReceiptReader(tess);
 const prepared=(await Promise.all(images.map(image=>prepareVatOcrImage(image,onProgress,options)))).flat();
 const recognized=await readerRef.current.recognize(prepared,onProgress);
 const first={...recognized,parsed:parseNorwegianReceipt(recognized.text)};
 let best={...first,retried:false};
 if(needsVatReceiptRetry(first)){
  onProgress("Noen felt mangler. Prøver en annen måte å lese kvitteringen på …");
  try{
   const second=await readerRef.current.recognize(prepared,onProgress,{layout:"column"});
   best=chooseVatReceiptScan(first,{...second,parsed:parseNorwegianReceipt(second.text)});
  }catch{
   // Keep the first OCR result if the alternate layout is unsupported or fails.
   onProgress("Alternativ lesing var ikke tilgjengelig. Beholder første resultat …");
  }
 }
 return {text:best.text,confidence:best.confidence,format,parsed:best.parsed,retried:best.retried};
}

export default function VatReceiptScanner({onSelected,onExtracted,onBusyChange,documentType="receipt",disabled=false}){
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [details,setDetails]=useState(null);
 const [busy,setBusy]=useState(false);
 const [processedNotice,setProcessedNotice]=useState("");
 const [cropJob,setCropJob]=useState(null);
 const [imageForCrop,setImageForCrop]=useState(null);
 const [diagnostic,setDiagnostic]=useState(null);
 const [liveCamera,setLiveCamera]=useState(false);
 const scanId=useRef(0);
 const readerRef=useRef(null);
 useEffect(()=>()=>{if(readerRef.current)void readerRef.current.close().catch(()=>{});},[]);
 async function recognizeSelected(file,meta,options={}){
  // When rescanning a crop or retrying OCR, the already selected original
  // receipt stays attached. Only the initial camera/file choice changes it.
  if(!options.preserveAttachment)onSelected(file,meta);
  const startTime=typeof performance!=="undefined"?performance.now():Date.now();
  const recognized=await readLocalReceipt(file,setProgress,readerRef,options);
  const seconds=Math.round(((typeof performance!=="undefined"?performance.now():Date.now())-startTime)/100)/10;
  const parsed=recognized.parsed||parseNorwegianReceipt(recognized.text);
  if(recognized.confidence!==null&&recognized.confidence<55&&parsed.documentDate){
   parsed.documentDate="";
   parsed.warnings.unshift("Datoen ble lest med lav sikkerhet og fylles ikke ut. Kontroller datoen på kvitteringen.");
  }
  if(recognized.confidence!==null&&recognized.confidence<45&&parsed.supplierName){
   parsed.supplierName="";
   parsed.warnings.unshift("OCR-teksten er for usikker til å foreslå leverandør. Kontroller kvitteringsbildet.");
  }
  const detectedFields=[parsed.supplierName,parsed.documentNumber,parsed.documentDate].filter(Boolean).length+
   Object.keys(parsed.groups||{}).length;
  setDetails({...parsed,format:recognized.format,preview:recognized.text.slice(0,7500),detectedFields,seconds,confidence:recognized.confidence});
  onExtracted(parsed);
  setProgress(detectedFields>0
   ?"Lesing fullført på "+seconds+" s"+(recognized.retried?" etter to lesemetoder":"")+". "+detectedFields+" forslag. Kontroller dem før lagring."
   :"Lesing fullført på "+seconds+" s, men ingen sikre opplysninger funnet. Juster utsnitt eller ta et skarpere bilde.");

 }
 async function chooseSource(source){
  if(!source||busy||disabled||cropJob)return;
  setError("");setDetails(null);setProgress("");setProcessedNotice("");setImageForCrop(null);setDiagnostic(null);
  // Keep the current attachment if the new file cannot be opened/validated.
  // Once validation succeeds, replace the previous receipt before OCR starts.
  const thisScan=++scanId.current;
  setBusy(true);onBusyChange?.(true);
  try{
   const prepared=await prepareReceiptFile(source,setProgress);
   if(thisScan!==scanId.current)return;
   onSelected(null);
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
 function choose(event){
  const source=event.target.files?.[0]||null;
  event.target.value="";
  if(source)void chooseSource(source);
 }
 async function applyCrop(croppedFile,meta){
  if(!cropJob)return;
  const original=cropJob;
  setCropJob(null);
  const copied=Boolean(meta?.cropped||original.previouslyConverted);
  const thisScan=++scanId.current;
  setBusy(true);onBusyChange?.(true);setError("");setProgress("");
  try{
   setProcessedNotice(original.previouslyConverted
    ?"Det beskårne bildet brukes bare til tekstlesing. Vedlegget er en JPEG-kopi; behold originalfotoet selv."
    :"Det beskårne bildet brukes bare til tekstlesing. Originalfotoet beholdes som bilagsvedlegg.");
   await recognizeSelected(croppedFile,{converted:copied,originalName:original.originalName},{preserveAttachment:true});
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
 async function retryRead(noAutoCrop=false){
  if(!imageForCrop||busy||disabled||cropJob)return;
  setBusy(true);onBusyChange?.(true);setError("");setProgress("");setDetails(null);
  try{
   await recognizeSelected(imageForCrop.file,{converted:imageForCrop.previouslyConverted,originalName:imageForCrop.originalName},
    {noAutoCrop,preserveAttachment:true});
  }catch(e){
   setProgress("");
   setError("Ny tekstlesing mislyktes: "+String(e.message||"ukjent feil")+".");
  }finally{setBusy(false);onBusyChange?.(false);}
 }
 async function testReader(){
  if(busy||disabled||cropJob)return;
  setBusy(true);onBusyChange?.(true);
  setDiagnostic({ok:null,message:"Tester tekstleseren på denne telefonen …"});
  try{
   const canvas=document.createElement("canvas");
   canvas.width=1200;canvas.height=550;
   const ctx=canvas.getContext("2d");
   if(!ctx)throw Error("Telefonen kunne ikke starte bildetest.");
   ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.fillStyle="#111111";ctx.font="bold 68px Arial";
   ctx.fillText("KVITTERING 123456",55,130);
   ctx.fillText("MEGAFLIS BERGEN",55,240);
   ctx.fillText("TOTAL 125,00",55,350);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.92));
   canvas.width=0;canvas.height=0;
   if(!blob)throw Error("Telefonen kunne ikke lage testbildet.");
   const file=new File([blob],"ocr-testbilde.jpg",{type:"image/jpeg"});
   const result=await readLocalReceipt(file,message=>setDiagnostic({ok:null,message}),readerRef);
   const chars=result.text.replace(/\s/g,"").length;
   if(chars<12)throw Error("Lesemotoren startet, men fant ikke tilstrekkelig tekst i testbildet.");
   setDiagnostic({ok:true,message:"Tekstleseren virker på denne telefonen. Den fant tekst i et innebygd eksempelbilde. En virkelig kvittering må fortsatt være skarp og tydelig."});
  }catch(e){
   setDiagnostic({ok:false,message:"Tekstleseren virker ikke som forventet: "+String(e.message||"ukjent feil")});
  }finally{setBusy(false);onBusyChange?.(false);}
 }

 return <section className={styles.scanShell}>
  <h3>{documentType==="invoice"?"Last opp faktura":"1. Legg til kvittering"}</h3>
  <p className={styles.scanLead}>Ta bilde eller velg en fil. Vi forsøker å fylle ut feltene automatisk.</p>
  <div className={styles.uploadActions}>
   <button type="button" className={styles.uploadAction} disabled={disabled||busy||Boolean(cropJob)}
    onClick={()=>setLiveCamera(true)}>📷 Skann med ramme</button>
   <label className={styles.uploadAction}>📁 Velg bilde / PDF
    <input aria-label="Velg kvittering fra telefonen" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp"
     disabled={disabled||busy||Boolean(cropJob)} onChange={choose}/>
   </label>
  </div>
  {!liveCamera&&<label className={styles.nativeCameraLink}>Bruk vanlig kamera
   <input aria-label="Ta bilde av kvittering" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
    disabled={disabled||busy||Boolean(cropJob)} onChange={choose}/>
  </label>}
  {liveCamera&&<VatReceiptLiveCamera onCapture={file=>{setLiveCamera(false);void chooseSource(file);}}
   onCancel={()=>setLiveCamera(false)} disabled={disabled||busy}/>} 
  <details className={styles.scanHelp}>
   <summary>Hjelp hvis tekstlesingen ikke virker</summary>
   <p>PDF maks 4 MB, bilder opptil 25 MB. OCR skjer på telefonen, mens program og språkfiler lastes fra en ekstern leverandør. Nå brukes en mindre lesekopi av bildet, og samme lesemotor gjenbrukes ved neste kvittering. Hvis et utsnitt blir feil, kan du justere det. Originalen beholdes i regnskapet.</p>
   <button type="button" className={styles.textAction} disabled={disabled||busy||Boolean(cropJob)} onClick={testReader}>
    Test tekstleseren på denne telefonen
   </button>
   <p style={{fontSize:12}}>Tester bare et innebygd eksempelbilde. Ingen kvittering, regnskapsdata eller bilder sendes til Aadland Service.</p>
   {diagnostic&&<p role={diagnostic.ok===false?"alert":"status"} className={styles.scanMessage}
    style={diagnostic.ok===false?{color:"#a52a21"}:{}}>{diagnostic.message}</p>}
  </details>
  {imageForCrop&&!cropJob&&<div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
   <button type="button" className={styles.textAction} disabled={disabled||busy}
    onClick={()=>retryRead(false)}>Les bildet på nytt</button>
   <button type="button" className={styles.textAction} disabled={disabled||busy}
    onClick={()=>retryRead(true)}>Les hele bildet uten automatisk beskjæring</button>
   <button type="button" className={styles.textAction} disabled={disabled||busy}
    onClick={()=>{setCropJob(imageForCrop);setError("");setProgress("");}}>
    Juster utsnitt og les på nytt
   </button>
  </div>}
  {cropJob&&<VatReceiptCropper file={cropJob.file} onApply={applyCrop} onCancel={cancelCrop} disabled={busy||disabled}/>}
  {!cropJob&&busy&&<p role="status" className={styles.scanMessage}>Bildet leses automatisk. Feltene fylles ut når lesingen er ferdig.</p>}
  {processedNotice&&<p role="note" className={styles.scanMessage}>{processedNotice}</p>}
  {(busy||progress)&&<p role="status" className={styles.scanMessage}><strong>{progress||"Klargjør lesing …"}</strong></p>}
  {error&&<p role="alert" className={styles.scanMessage} style={{color:"#a52a21"}}>{error}</p>}
  {details&&<div className={styles.scanResult}>
   <strong>{details.detectedFields>0?"Fant "+details.detectedFields+" forslag fra kvitteringen":"Ingen sikre felt ble gjenkjent"}</strong>
   <p style={{fontSize:12}}>Brukte {details.seconds} sekunder{details.confidence!==null?", OCR-sikkerhet "+details.confidence+" %":""}. Dette er bare forslag.</p>
   <p>{documentType==="invoice"?details.documentNumber||"Fakturanummer ikke funnet":details.supplierName||"Leverandør ikke funnet"} · {details.documentDate||"Dato ikke funnet"} · {details.totalOre==null?"Sum ikke funnet":new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(details.totalOre/100)}</p>
   {details.warnings.length>0&&<ul>{details.warnings.map((warn,i)=><li key={i}>{warn}</li>)}</ul>}
   <details><summary>Vis lest tekst</summary>
    <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:230,overflow:"auto",fontSize:11}}>{details.preview}</pre>
   </details>
  </div>}
 </section>;
}
