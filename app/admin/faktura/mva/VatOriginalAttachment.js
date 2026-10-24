"use client";
import {useEffect,useState} from "react";

const formatSize=bytes=>Number(bytes)>0?(Number(bytes)/1024/1024).toFixed(2).replace(".",",")+" MB":"";
export default function VatOriginalAttachment({documentId}){
 const [attachment,setAttachment]=useState(null),[file,setFile]=useState(null),
  [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),
  [error,setError]=useState(""),[success,setSuccess]=useState("");
 const url="/api/admin/invoices/vat-attachments?documentId="+encodeURIComponent(documentId);
 useEffect(()=>{
  let active=true;setLoading(true);setAttachment(null);setError("");setSuccess("");setFile(null);
  fetch(url,{cache:"no-store"}).then(async response=>{
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Kunne ikke lese bilagsstatus.");
   if(active)setAttachment(result.attachment);
  }).catch(e=>{if(active)setError(e.message||"Vedleggsstatus er utilgjengelig.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[url]);
 async function upload(){
  if(!file||busy||loading||attachment)return;
  if(file.size>4*1024*1024||file.size<12){
   setError("Filen må være PDF, JPG, PNG eller WebP på maks 4 MB.");return;
  }
  if(!window.confirm("Lagre "+file.name+" som originalvedlegg til dette registrerte leverandørbilaget? "+
   "Vedlegget låses mot endring og er bare tilgjengelig for eieren."))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const form=new FormData();form.append("documentId",documentId);form.append("file",file);
   const response=await fetch("/api/admin/invoices/vat-attachments",{method:"POST",body:form});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Opplastingen ble ikke bekreftet.");
   setAttachment(result.attachment);setFile(null);
   setSuccess("Originalbilaget er lagret privat og knyttet til denne registreringen.");
  }catch(e){setError(e.message||"Kunne ikke lagre vedlegget.");}
  finally{setBusy(false);}
 }
 return <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ddd1c2",fontSize:13}}>
  {loading&&<p>Kontrollerer originalvedlegg …</p>}
  {!loading&&attachment&&<>
   <strong>Originalbilag lagret</strong> – {attachment.filename} ({formatSize(attachment.fileSize)})
   <div><a href={url+"&download=1"}>Last ned originalbilaget sikkert</a></div>
  </>}
  {!loading&&!attachment&&<>
   <label style={{display:"block"}}>Last opp originalfaktura/kvittering (PDF eller bilde, maks 4 MB)
    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
     disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setError("");}}/>
   </label>
   {file&&<div style={{margin:"6px 0"}}>Valgt: {file.name} ({formatSize(file.size)})</div>}
   <button type="button" onClick={upload} disabled={busy||!file}>
    {busy?"Laster opp …":"Lagre originalbilag"}
   </button>
  </>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {success&&<p role="status">{success}</p>}
 </div>;
}
