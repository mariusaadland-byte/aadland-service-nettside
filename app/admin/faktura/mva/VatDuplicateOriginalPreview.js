"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import VatInvoicePdfViewer from "./VatInvoicePdfViewer";
import styles from "./VatSimpleForm.module.css";

const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export default function VatDuplicateOriginalPreview({match}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [previousFile,setPreviousFile]=useState(null),[show,setShow]=useState(false);
 const [imageUrl,setImageUrl]=useState("");
 const [mounted,setMounted]=useState(false);
 const controller=useRef(null),requestId=useRef(0),closeRef=useRef(null),triggerRef=useRef(null);
 useEffect(()=>{setMounted(true);return()=>{requestId.current++;controller.current?.abort();};},[]);
 useEffect(()=>{
  if(!previousFile||!previousFile.type.startsWith("image/")){setImageUrl("");return;}
  const url=URL.createObjectURL(previousFile);
  setImageUrl(url);
  return()=>URL.revokeObjectURL(url);
 },[previousFile]);
 useEffect(()=>{
  if(!show||!imageUrl)return;
  const root=document.documentElement,body=document.body;
  const previousRoot=root.style.overflow,previousBody=body.style.overflow;
  root.style.overflow="hidden";body.style.overflow="hidden";
  const focus=document.activeElement;
  closeRef.current?.focus({preventScroll:true});
  const esc=e=>{
   if(e.key==="Escape"){e.preventDefault();e.stopPropagation();
    e.stopImmediatePropagation?.();setShow(false);}
   if(e.key==="Tab"){
    e.preventDefault();closeRef.current?.focus({preventScroll:true});
   }
  };
  window.addEventListener("keydown",esc,true);
  return()=>{
   window.removeEventListener("keydown",esc,true);
   root.style.overflow=previousRoot;body.style.overflow=previousBody;
   (triggerRef.current||focus)?.focus?.({preventScroll:true});
  };
 },[show,imageUrl]);
 async function openPrevious(e){
  e?.preventDefault();e?.stopPropagation();
  if(busy||!uuid(match?.id))return;
  if(previousFile){setShow(true);return;}
  const id=++requestId.current,abort=new AbortController();
  controller.current?.abort();controller.current=abort;
  setBusy(true);setError("");
  const url="/api/admin/invoices/vat-attachments?documentId="+encodeURIComponent(match.id);
  try{
   const infoRes=await fetch(url,{cache:"no-store",signal:abort.signal});
   const info=await infoRes.json().catch(()=>({}));
   if(!infoRes.ok)throw Error(info.error||"Kunne ikke kontrollere det gamle bilaget.");
   if(!info.attachment){
    throw Error("Det tidligere bilaget har ikke et lagret originalvedlegg. Sammenlign fakturanummer, dato og beløp mot originalen i regnskapssystemet.");
   }
   const mime=info.attachment.mimeType;
   if(!allowed.has(mime))throw Error("Dette originalformatet støttes ikke for forhåndsvisning.");
   const bytes=await fetch(url+"&download=1",{cache:"no-store",signal:abort.signal});
   if(!bytes.ok){
    const details=await bytes.json().catch(()=>({}));
    throw Error(details.error||"Kunne ikke lese det tidligere originalbilaget.");
   }
   const blob=await bytes.blob();
   if(blob.size<12||blob.size>4*1024*1024||blob.size!==Number(info.attachment.fileSize))
    throw Error("Originalbilagets størrelse kunne ikke bekreftes.");
   if(id!==requestId.current||abort.signal.aborted)return;
   // This is a read-only copy obtained from the protected owner-only
   // attachment API. The server checks its SHA256 before returning bytes.
   const file=new File([blob],info.attachment.filename||"tidligere-bilag",
    {type:mime});
   setPreviousFile(file);setShow(true);
  }catch(err){
   if(id===requestId.current&&err?.name!=="AbortError")
    setError(err.message||"Kunne ikke åpne tidligere bilag.");
  }finally{
   if(id===requestId.current){controller.current=null;setBusy(false);}
  }
 }
 const close=e=>{e?.preventDefault?.();e?.stopPropagation?.();setShow(false);};
 if(!uuid(match?.id))return null;
 const isPdf=previousFile?.type==="application/pdf";
 return <div className={styles.duplicateOriginal}>
  <button ref={triggerRef} type="button" className={styles.duplicateOpenOriginal}
   disabled={busy} onClick={openPrevious}>
   {busy?"Henter tidligere original …":"Se tidligere originalbilag"}
  </button>
  {error&&<p className={styles.duplicateOriginalError} role="alert">{error}</p>}
  {previousFile&&isPdf&&show&&
   <VatInvoicePdfViewer file={previousFile} autoOpen
    title="Tidligere originalbilag" onClose={()=>setShow(false)}/>}
  {mounted&&previousFile&&imageUrl&&!isPdf&&show&&createPortal(
   <div className={styles.duplicateImageModal} role="dialog" aria-modal="true"
    aria-label="Tidligere originalbilag" onClick={e=>e.stopPropagation()}
    onPointerDown={e=>e.stopPropagation()}>
    <header className={styles.duplicateImageHeader}>
     <strong>Tidligere originalbilag</strong>
     <button ref={closeRef} type="button" onClick={close}>Lukk ✕</button>
    </header>
    <div className={styles.duplicateImageScroll}>
     <img src={imageUrl} alt="Tidligere registrert originalbilag" />
    </div>
    <p className={styles.duplicateImageFooter}>Kun forhåndsvisning. Du kommer tilbake til de utfylte feltene når du lukker.</p>
   </div>,document.body)}
 </div>;
}
