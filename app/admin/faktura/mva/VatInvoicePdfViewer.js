"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import styles from "./VatSimpleForm.module.css";

const PDFJS_URL="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
let pdfJsPromise;
function loadPdfReader(){
 if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
 if(!pdfJsPromise){
  pdfJsPromise=new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   script.src=PDFJS_URL;script.async=true;script.crossOrigin="anonymous";
   script.onload=()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(Error("PDF-leseren kunne ikke starte."));
   script.onerror=()=>reject(Error("Kunne ikke laste PDF-leseren. Sjekk nettilkoblingen."));
   document.head.appendChild(script);
  }).catch(error=>{pdfJsPromise=null;throw error;});
 }
 return pdfJsPromise;
}

// Only render the chosen local PDF in a canvas. It never goes to a
// third-party PDF viewer, gets uploaded, or is written to persistent storage.
export default function VatInvoicePdfViewer({file}){
 const [open,setOpen]=useState(false),[mounted,setMounted]=useState(false);
 const [pdf,setPdf]=useState(null),[pages,setPages]=useState(0);
 const [pageNumber,setPageNumber]=useState(1),[zoom,setZoom]=useState(1);
 const [loading,setLoading]=useState(false),[rendering,setRendering]=useState(false);
 const [error,setError]=useState("");
 const canvasRef=useRef(null),scrollRef=useRef(null),dialogRef=useRef(null);
 const closeRef=useRef(null),triggerRef=useRef(null);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{
  setOpen(false);setPdf(null);setPages(0);setPageNumber(1);setZoom(1);
 },[file]);
 useEffect(()=>{
  if(!open)return;
  const body=document.body,scrollY=window.scrollY;
  const previous={position:body.style.position,top:body.style.top,
   left:body.style.left,right:body.style.right,width:body.style.width,overflow:body.style.overflow};
  body.style.position="fixed";body.style.top="-"+scrollY+"px";body.style.left="0";
  body.style.right="0";body.style.width="100%";body.style.overflow="hidden";
  closeRef.current?.focus();
  const onKey=e=>{
   if(e.key==="Escape"){e.preventDefault();setOpen(false);}
   else if(e.key==="Tab"){
    const controls=[...(dialogRef.current?.querySelectorAll("button:not([disabled])")||[])];
    if(!controls.length)return;
    if(e.shiftKey&&document.activeElement===controls[0]){
     e.preventDefault();controls[controls.length-1].focus();
    }else if(!e.shiftKey&&document.activeElement===controls[controls.length-1]){
     e.preventDefault();controls[0].focus();
    }
   }
  };
  window.addEventListener("keydown",onKey);
  return ()=>{
   window.removeEventListener("keydown",onKey);
   for(const key of Object.keys(previous))body.style[key]=previous[key];
   window.scrollTo(0,scrollY);
   triggerRef.current?.focus();
  };
 },[open]);
 useEffect(()=>{
  if(!open||!file)return;
  let cancelled=false,document=null;
  setLoading(true);setError("");setPdf(null);setPages(0);setPageNumber(1);setZoom(1);
  (async()=>{
   try{
    const library=await loadPdfReader();
    library.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
    const data=new Uint8Array(await file.arrayBuffer());
    const task=library.getDocument({data});
    document=await task.promise;
    if(cancelled){await document.destroy().catch(()=>{});document=null;return;}
    if(!document.numPages)throw Error("PDF-filen inneholder ingen sider.");
    setPdf(document);setPages(document.numPages);
   }catch(e){
    if(!cancelled)setError(e?.name==="PasswordException"
     ?"Fakturaen er passordbeskyttet. Åpne en ulåst PDF.":e.message||"Kunne ikke åpne PDF-filen.");
   }finally{if(!cancelled)setLoading(false);}
  })();
  return()=>{cancelled=true;if(document)void document.destroy().catch(()=>{});};
 },[open,file]);
 useEffect(()=>{
  if(!open||!pdf)return;
  let cancelled=false,renderTask=null;
  const draw=async()=>{
   setRendering(true);setError("");
   try{
    const page=await pdf.getPage(pageNumber);
    if(cancelled)return;
    const wrapper=scrollRef.current,canvas=canvasRef.current;
    if(!wrapper||!canvas)return;
    const original=page.getViewport({scale:1});
    const width=Math.max(250,(wrapper.clientWidth||window.innerWidth)-30);
    const cssScale=width/original.width*zoom;
    const cssWidth=original.width*cssScale,cssHeight=original.height*cssScale;
    const deviceScale=Math.min(window.devicePixelRatio||1,2,
     Math.sqrt(7000000/(cssWidth*cssHeight)));
    const viewport=page.getViewport({scale:cssScale*deviceScale});
    canvas.width=Math.max(1,Math.round(viewport.width));
    canvas.height=Math.max(1,Math.round(viewport.height));
    canvas.style.width=cssWidth+"px";canvas.style.height=cssHeight+"px";
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)throw Error("Telefonen klarte ikke vise PDF-siden.");
    renderTask=page.render({canvasContext:ctx,viewport});
    await renderTask.promise;
    if(!cancelled&&scrollRef.current)scrollRef.current.scrollTo(0,0);
   }catch(e){
    if(!cancelled&&e?.name!=="RenderingCancelledException")
     setError(e?.message||"Kunne ikke tegne PDF-siden.");
   }finally{if(!cancelled)setRendering(false);}
  };
  void draw();
  return()=>{cancelled=true;renderTask?.cancel();};
 },[open,pdf,pageNumber,zoom]);
 if(!file||file.type!=="application/pdf")return null;
 return <>
  <button ref={triggerRef} type="button" className={styles.pdfOpenButton}
   onClick={()=>setOpen(true)}> <span aria-hidden="true">📄</span> Åpne og les fakturaen (PDF)</button>
  {mounted&&open&&createPortal(<div ref={dialogRef} className={styles.pdfViewerModal}
   role="dialog" aria-modal="true" aria-label="Vis opplastet leverandørfaktura">
   <header className={styles.pdfViewerHeader}>
    <div><strong>Leverandørfaktura</strong><span title={file.name}>{file.name}</span></div>
    <button ref={closeRef} type="button" className={styles.pdfViewerClose}
     onClick={()=>setOpen(false)}>Lukk ✕</button>
   </header>
   <div className={styles.pdfViewerToolbar}>
    <button type="button" disabled={loading||pageNumber<=1||rendering}
     onClick={()=>setPageNumber(n=>Math.max(1,n-1))} aria-label="Forrige PDF-side">‹ Forrige</button>
    <span className={styles.pdfPageCounter} aria-live="polite">
     {pages?"Side "+pageNumber+" av "+pages:"Åpner PDF …"}
    </span>
    <button type="button" disabled={loading||!pages||pageNumber>=pages||rendering}
     onClick={()=>setPageNumber(n=>Math.min(pages,n+1))} aria-label="Neste PDF-side">Neste ›</button>
   </div>
   <div ref={scrollRef} className={styles.pdfViewerScroll}>
    {loading&&<p role="status" className={styles.pdfViewerStatus}>Leser fakturaen fra telefonen …</p>}
    {error&&<p role="alert" className={styles.pdfViewerStatus}>{error}</p>}
    {rendering&&!error&&<p role="status" className={styles.pdfViewerStatus}>Viser side {pageNumber} …</p>}
    <canvas ref={canvasRef} className={styles.pdfViewerCanvas} aria-label={"Faktura side "+pageNumber} role="img"
     style={{visibility:pdf&&!error?"visible":"hidden"}}/>
   </div>
   <footer className={styles.pdfViewerFooter}>
    <button type="button" disabled={loading||zoom<=.75||rendering}
     onClick={()=>setZoom(z=>Math.max(.75,Math.round((z-.25)*100)/100))}>− Mindre</button>
    <strong>{Math.round(zoom*100)} %</strong>
    <button type="button" disabled={loading||zoom>=2.5||rendering}
     onClick={()=>setZoom(z=>Math.min(2.5,Math.round((z+.25)*100)/100))}>＋ Større</button>
    <p>Hele fakturaen kan leses her. Lukk for å kontrollere OCR-feltene. Ingen bilag registreres ved visning.</p>
   </footer>
  </div>,document.body)}
 </>;
}
