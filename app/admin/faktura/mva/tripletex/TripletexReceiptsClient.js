"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./TripletexReceipts.module.css";
const endpoint="/api/admin/invoices/tripletex";
const addressKey="aadland-tripletex-ebilag-recipient-v1";
const senderAddress=s=>String(s||"").trim().toLowerCase();
const validRecipient=s=>/^[a-z0-9._%+-]+@ebilag\.com$/.test(senderAddress(s));
const size=n=>new Intl.NumberFormat("nb-NO",{maximumFractionDigits:1}).format(Number(n||0)/1024/1024)+" MB";
const messageState=state=>state==="accepted"?
 "Akseptert av e-posttjenesten – sjekk Tripletex":state==="sending"?
 "Påbegynt – kontroller Tripletex før nytt forsøk":state==="needs_review"?
 "Uklart resultat – kontroller før nytt forsøk":"Ikke overført";

export default function TripletexReceiptsClient(){
 const [rows,setRows]=useState([]),[summary,setSummary]=useState(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [address,setAddress]=useState("");
 const [remember,setRemember]=useState(true);
 const [confirmed,setConfirmed]=useState(false);
 const [lockedRecipient,setLockedRecipient]=useState("");
 const [error,setError]=useState(""),[info,setInfo]=useState("");
 const [progress,setProgress]=useState({done:0,total:0});
 const stop=useRef(false);
 useEffect(()=>{
  // Only a non-secret recipient address is cached in this browser.
  try{
   const saved=window.localStorage.getItem(addressKey)||"";
   if(validRecipient(saved))setAddress(previous=>previous||senderAddress(saved));
  }catch{}
 },[]);
 const load=useCallback(async()=>{
  const response=await fetch(endpoint,{cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Kunne ikke hente kvitteringene.");
  setRows(data.rows||[]);setSummary(data.summary);
  if(validRecipient(data.preferredRecipient)){
   const saved=senderAddress(data.preferredRecipient);
   setLockedRecipient(saved);setAddress(saved);
  }
  return data;
 },[]);
 useEffect(()=>{
  let active=true;
  load().catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;stop.current=true};
 },[load]);
 const canSend=validRecipient(address)&&confirmed;
 const pending=rows.filter(row=>!row.transfer&&Boolean(row.attachment));
 const unsupported=rows.filter(row=>row.attachment&&
  !["application/pdf","image/jpeg","image/png"].includes(row.attachment.mime_type));
 const transfer=async()=>{
  if(busy||!canSend||pending.length===0)return;
  const recipient=senderAddress(address);
  const count=pending.filter(row=>["application/pdf","image/jpeg","image/png"]
   .includes(row.attachment.mime_type)).length;
  if(count===0)return;
  const approved=window.confirm("Overføre "+count+" originalbilag til "+recipient+
   "?\n\nDette sender ekte dokumenter til bilagsmottaket i Tripletex. Hver sending er låst mot duplikater. Du må deretter kontrollere bilagene i Tripletex før bokføring.");
  if(!approved)return;
  try{
   if(remember)window.localStorage.setItem(addressKey,recipient);
   else window.localStorage.removeItem(addressKey);
  }catch{}
  setBusy(true);stop.current=false;setError("");setInfo("");
  setProgress({done:0,total:count});
  let completed=0;
  for(const row of pending){
   if(stop.current)break;
   if(!["application/pdf","image/jpeg","image/png"].includes(row.attachment.mime_type))continue;
   try{
    const response=await fetch(endpoint,{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({action:"send-document",documentId:row.document.id,
      recipient,recipientConfirmation:recipient,confirmed:true})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Uklart resultat for bilaget.");
    completed++;
    setProgress({done:completed,total:count});
    // Refresh state from server after each successful action; never trust
    // the local state as proof that the external inbox received the file.
    await load();
   }catch(e){
    setError("Overføringen ble stoppet: "+(e.message||"Ukjent feil.")+
     " Sjekk Tripletex og statuslisten før du fortsetter.");
    stop.current=true;
    break;
   }
  }
  try{await load();}catch(e){setError(e.message);}
  if(!stop.current)setInfo(completed+" bilag er akseptert av e-posttjenesten. Kontroller at alle vises i Tripletex før du bokfører.");
  else if(completed>0)setInfo(completed+" bilag ble akseptert før overføringen stoppet.");
  setBusy(false);
 };
 return <div className={styles.shell}>
  <header className={styles.head}>
   <h2 style={{fontSize:22}}>Inngående kvitteringer og leverandørbilag</h2>
   <p>Alle registrerte, aktive leverandørbilag fra alle terminer. Originalene sendes til Tripletex sitt bilagsmottak – ingen kostnader eller MVA bokføres automatisk.</p>
  </header>
  {summary&&<div className={styles.stats}>
   <div className={styles.stat}><strong>{summary.total}</strong><span>Registrerte bilag</span></div>
   <div className={styles.stat}><strong>{summary.withOriginal}</strong><span>Med originalfil</span></div>
   <div className={styles.stat}><strong>{summary.acceptedByEmailProvider}</strong><span>Akseptert av e-posttjenesten</span></div>
  </div>}
  {loading&&<p role="status">Henter registrerte kvitteringer …</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {info&&<p role="status" className={styles.progress}>{info}</p>}
  {!loading&&<>
   <section className={styles.section}>
    <h2>1. Klar for overføring</h2>
    <p className={styles.hint}>Vi har {summary?.withOriginal??0} originalfiler ({size(summary?.totalBytes)}) klare for overføring.
     {" "}Du kan ta ut en samlet CSV-oversikt før du sender. CSV-filen er en kontrolliste, <strong>ikke en ferdig bokføringsimport</strong> – konto og MVA-kode må kontrolleres i Tripletex.</p>
    <div className={styles.actions}>
     <a className={styles.link} href={endpoint+"?format=csv"}>Last ned alle bilagsopplysninger (CSV)</a>
    </div>
    {summary?.missingOriginal>0&&<p role="alert" className={styles.error}>
     {summary.missingOriginal} bilag mangler originalfil. Disse blir ikke sendt før vedlegget er lagt til.</p>}
   </section>
   <section className={styles.section}>
    <h2>2. Velg mottaker én gang</h2>
    <p className={styles.hint}>Finn adressen i Tripletex under <strong>Bilag → Innstillinger → Bilagsmottak</strong>.
     Bruk adressen som slutter på <strong>@ebilag.com</strong>.
     {" "}<a className={styles.link} target="_blank" rel="noreferrer"
      href="https://hjelp.tripletex.no/hc/no/articles/17758675898129-Slik-legger-du-inn-e-postadresse-for-bilagsmottaket">Hjelp fra Tripletex</a>
    </p>
    <div className={styles.inputs}>
     <label>E-bilagsadresse
      <input type="email" autoComplete="off" spellCheck={false}
       placeholder="dittfirma@ebilag.com" value={address}
       onChange={e=>{setAddress(e.target.value);setConfirmed(false);}} disabled={busy||Boolean(lockedRecipient)}/>
     </label>
    </div>
    {lockedRecipient&&<p className={styles.hint}>Denne adressen er allerede brukt på tidligere sendinger og er låst mot utilsiktet bytte: <strong>{lockedRecipient}</strong>.</p>}
    {address&&!validRecipient(address)&&<p className={styles.error}>Bruk e-bilagsadressen fra Tripletex (@ebilag.com).</p>}
    <label className={styles.check}><input type="checkbox" checked={remember}
     onChange={e=>setRemember(e.target.checked)} disabled={busy}/>
     <span>Husk e-bilagsadressen i denne nettleseren til neste gang.</span>
    </label>
    <label className={styles.check}><input type="checkbox" checked={confirmed}
     onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/>
     <span>Jeg har kopiert adressen fra Tripletex og kontrollert at den tilhører firmaets bilagsmottak. Jeg forstår at e-postleverandørens bekreftelse ikke betyr at bilaget er bokført.</span>
    </label>
    <div className={styles.actions}>
     <button type="button" className={styles.primary} disabled={!canSend||!pending.length||busy}
      onClick={transfer}>{busy?"Sender bilag …":"Overfør "+pending.length+" usendte bilag til Tripletex"}</button>
     {busy&&<button type="button" onClick={()=>{stop.current=true;setInfo("Stopper etter pågående bilag …");}}>
      Stopp etter dette bilaget</button>}
    </div>
    {busy&&<p role="status" className={styles.progress}>{progress.done} av {progress.total} bekreftet av e-posttjenesten. Ikke lukk siden før overføringen er ferdig.</p>}
    {summary?.requiresReview>0&&<p role="alert" className={styles.error}>
     {summary.requiresReview} bilag har uklar sendestatus. De blir aldri sendt automatisk på nytt. Kontroller Tripletex og sendeloggen først.</p>}
    {unsupported.length>0&&<p className={styles.error}>{unsupported.length} vedlegg har et format Tripletex ikke godtar. Last ned og konverter disse før overføring.</p>}
    <p className={styles.hint}>Bilag som allerede er sendt eller har uklar sendestatus blir hoppet over. Hvis du avbryter, kan du fortsette med de resterende senere.</p>
   </section>
   <section className={styles.section}>
    <h2>3. Kvitteringene og status</h2>
    <div className={styles.list}>{rows.map(row=><div key={row.document.id} className={styles.item}>
     <div className={styles.itemInfo}>
      <strong>{row.document.supplier_name}</strong>
      <small>{row.document.document_date} · {row.document.supplier_document_number}
       {row.document.kind==="credit"?" · Kreditnota":""}</small>
      <small className={styles.status}>{row.attachment?messageState(row.transfer?.status):"Mangler originalfil"}</small>
      <small>{row.attachment?.original_filename||"Ingen vedlagt fil"}</small>
     </div>
     <div className={styles.itemLinks}>
      {row.attachment&&<a href={"/api/admin/invoices/vat-attachments?documentId="+encodeURIComponent(row.document.id)+"&download=1"}>
       Åpne original</a>}
     </div>
    </div>)}</div>
   </section>
  </>}
 </div>;
}
