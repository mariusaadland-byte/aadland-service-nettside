// Browser-only original invoice reader. Private invoice bytes are fetched
// from the site's owner-only endpoint and processed IN THE BROWSER.
// No invoice file or OCR text is sent to PDF.js/Tesseract providers.
import {vatPdfTextRows} from "./vatPdfTextLayout";
import {createVatReceiptReader} from "./vatReceiptRecognition";
import {suggestExternalInvoiceVat} from "./externalInvoiceAutofill";

const PDFJS_URL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
const TESSERACT_URL="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const MAX_FILE_BYTES=4*1024*1024;
const LOAD_TIMEOUT_MS=25000;
const loaded=new Map();
function scriptFromCdn(url,globalName){
 if(typeof window==="undefined")throw Error("Dokumentleseren krever en nettleser.");
 if(window[globalName])return Promise.resolve(window[globalName]);
 if(loaded.has(url))return loaded.get(url);
 const task=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=url;script.async=true;script.crossOrigin="anonymous";
  let complete=false;
  const finish=(error,result)=>{
   if(complete)return;complete=true;
   window.clearTimeout(timer);
   if(error){script.remove();reject(error);}
   else resolve(result);
  };
  const timer=window.setTimeout(()=>finish(Error("Tekstleseren brukte for lang tid på å starte.")),LOAD_TIMEOUT_MS);
  script.onload=()=>window[globalName]?
   finish(null,window[globalName]):
   finish(Error("Tekstleseren ble lastet uten riktig bibliotek."));
  script.onerror=()=>finish(Error("Fakturaleseverktøyet kunne ikke lastes. Sjekk internettforbindelsen."));
  document.head.appendChild(script);
 }).catch(error=>{loaded.delete(url);throw error;});
 loaded.set(url,task);
 return task;
}
const aborted=signal=>{
 if(signal?.aborted)throw Error("Lesingen ble avbrutt.");
};
function safeFilename(name){
 return String(name||"faktura").slice(0,150).replace(/[\r\n/\\]/g,"_");
}
async function recognizeImages(images,onProgress,signal){
 aborted(signal);
 const tesseract=await scriptFromCdn(TESSERACT_URL,"Tesseract");
 aborted(signal);
 const reader=createVatReceiptReader(tesseract);
 try{
  const result=await reader.recognize(images,message=>{
   if(!signal?.aborted)onProgress(message);
  });
  aborted(signal);
  return result.text||"";
 }finally{
  await reader.close().catch(()=>{});
 }
}
async function renderPdfPage(page){
 const viewport0=page.getViewport({scale:1});
 const ratio=Math.min(2.2,Math.sqrt(2400000/(viewport0.width*viewport0.height)));
 const viewport=page.getViewport({scale:Math.max(0.75,ratio)});
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(viewport.width));
 canvas.height=Math.max(1,Math.round(viewport.height));
 try{
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("Nettleseren klarte ikke lese PDF-siden.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport}).promise;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.90));
  if(!blob||!blob.size)throw Error("Kunne ikke klargjøre den skannede PDF-siden.");
  return blob;
 }finally{
  canvas.width=0;canvas.height=0;
 }
}
export async function readExternalInvoiceAmountFromOriginal(
 {id,invoiceNumber,amountOre},onProgress=()=>{},signal
){
 if(!/^[a-f0-9-]{36}$/i.test(String(id||"")))
  throw Error("Ugyldig faktura for dokumentlesing.");
 onProgress("Åpner originalfakturaen privat …");
 const response=await fetch("/api/admin/invoices/external-register?download=1&id="+
  encodeURIComponent(id),{cache:"no-store",signal});
 if(!response.ok)throw Error("Originalfakturaen kunne ikke hentes sikkert. Åpne PDF-en manuelt.");
 const blob=await response.blob();
 aborted(signal);
 if(blob.size<12||blob.size>MAX_FILE_BYTES)
  throw Error("Dokumentet har ugyldig størrelse.");
 const mime=blob.type.split(";")[0];
 const invoice={invoice_number:invoiceNumber,amount_ore:amountOre};
 if(mime==="application/pdf"){
  onProgress("Leser MVA-beløpene i PDF-filen …");
  const lib=await scriptFromCdn(PDFJS_URL,"pdfjsLib");
  aborted(signal);
  lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  const task=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())});
  const pdf=await task.promise;
  try{
   if(!pdf.numPages||pdf.numPages>30)
    throw Error("PDF-en er for lang til automatisk beløpskontroll. Les beløpet manuelt.");
   const pieces=[];
   const textPages=Math.min(pdf.numPages,12);
   for(let n=1;n<=textPages;n++){
    aborted(signal);
    const page=await pdf.getPage(n);
    const content=await page.getTextContent();
    pieces.push(vatPdfTextRows(content.items));
    const suggestion=suggestExternalInvoiceVat(pieces.join("\n"),invoice);
    if(suggestion.ok)return {...suggestion,method:"PDF-tekst",pagesRead:n};
   }
   const extracted=pieces.join("\n");
   let suggested=suggestExternalInvoiceVat(extracted,invoice);
   // PDF may contain a scanned invoice with no selectable text.
   // Only attempt OCR on at most the first and last pages to keep mobile
   // memory and battery usage bounded; users can review manually otherwise.
   if(suggested.ok)return {...suggested,method:"PDF-tekst",pagesRead:textPages};
   onProgress("Fakturaen kan være skannet. Prøver bildelesing …");
   const pages=pdf.numPages===1?[1]:[1,pdf.numPages];
   const images=[];
   for(const pageNo of pages){
    aborted(signal);
    images.push(await renderPdfPage(await pdf.getPage(pageNo)));
   }
   const ocr=await recognizeImages(images,onProgress,signal);
   const ocrSuggestion=suggestExternalInvoiceVat(ocr,invoice);
   if(ocrSuggestion.ok)return {...ocrSuggestion,method:"PDF-skann",pagesRead:pages.length};
   return {ok:false,reason:ocrSuggestion.reason||suggested.reason||
    "MVA-beløpene kunne ikke leses entydig fra PDF-filen."};
  }finally{
   await pdf.destroy().catch(()=>{});
  }
 }
 if(["image/jpeg","image/png","image/webp"].includes(mime)){
  onProgress("Leser MVA-beløpene fra fakturabildet …");
  const text=await recognizeImages([new File([blob],safeFilename(invoiceNumber)+
   (mime==="image/png"?".png":mime==="image/webp"?".webp":".jpg"),
   {type:mime})],onProgress,signal);
  const suggestion=suggestExternalInvoiceVat(text,invoice);
  return suggestion.ok?{...suggestion,method:"bilde-OCR"}:suggestion;
 }
 throw Error("Denne filtypen kan ikke leses automatisk.");
}
