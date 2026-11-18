"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import {DEFAULT_TRIPLETEX_INBOX,tripletexPendingReceipts,tripletexReceiptQueue} from "../../../../../lib/tripletexReceiptTransfer";

const endpoint="/api/admin/invoices/tripletex";
const addressKey="aadland-tripletex-ebilag-recipient-v1";
const cleanAddress=value=>String(value||"").trim().toLowerCase();
const validAddress=value=>/^[a-z0-9._%+-]+@ebilag\.com$/.test(cleanAddress(value));
const sizes=bytes=>new Intl.NumberFormat("nb-NO",{maximumFractionDigits:1}).format(Number(bytes||0)/1048576)+" MB";
const supported=file=>file&&["application/pdf","image/jpeg","image/png"].includes(file.mime_type);
const description=row=>(row.document.supplier_name||"Ukjent leverandør")+" · "+
 (row.document.supplier_document_number||"Uten nummer")+" · "+row.document.document_date;

export default function TripletexReceiptsClient(){
 const [rows,setRows]=useState([]),[summary,setSummary]=useState(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [address,setAddress]=useState(DEFAULT_TRIPLETEX_INBOX);
 const [lockedRecipient,setLockedRecipient]=useState("");
 const [confirmedFirstInTripletex,setConfirmedFirstInTripletex]=useState(false);
 const [error,setError]=useState(""),[info,setInfo]=useState("");
 const [progress,setProgress]=useState({done:0,total:0});
 const stop=useRef(false);

 useEffect(()=>{
  try{
   const saved=window.localStorage.getItem(addressKey);
   if(validAddress(saved))setAddress(previous=>previous===DEFAULT_TRIPLETEX_INBOX?cleanAddress(saved):previous);
  }catch{}
 },[]);
 const load=useCallback(async()=>{
  const res=await fetch(endpoint,{cache:"no-store"});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body.error||"Kunne ikke hente bilag fra Aadland Service.");
  setRows(body.rows||[]);setSummary(body.summary||null);
  if(validAddress(body.preferredRecipient)){
   const remembered=cleanAddress(body.preferredRecipient);
   setAddress(remembered);setLockedRecipient(remembered);
  }
  return body;
 },[]);
 useEffect(()=>{
  let active=true;
  load().catch(err=>{if(active)setError(err.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;stop.current=true};
 },[load]);

 // Only documents with no prior attempt belong to the live work queue.
 const {remaining,eligible,needsReview,sent}=tripletexReceiptQueue(rows);
 const canSend=validAddress(address)&&(!lockedRecipient||cleanAddress(address)===lockedRecipient);
 const bulkPermitted=eligible.length<=1||
  (summary?.acceptedByEmailProvider>0&&confirmedFirstInTripletex);

 async function transfer({documentId=null,firstOnly=false}={}){
  if(busy||!canSend||!eligible.length)return;
  const individual=Boolean(documentId)||firstOnly;
  if(!individual&&!bulkPermitted)return;
  const selection=documentId?eligible.filter(r=>r.document.id===documentId):
   tripletexPendingReceipts(rows,firstOnly);
  if(!selection.length)return;

  const recipient=cleanAddress(address);
  const hint=selection.length===1?"\n\nBilag: "+description(selection[0]):"";
  if(!window.confirm("Overfør "+selection.length+" bilag til "+recipient+"?"+hint+
   "\n\nOriginalbilagene sendes til bilagsmottaket i Tripletex. Dette bokfører ikke bilagene. Kontroller dem der før godkjenning."))return;
  try{window.localStorage.setItem(addressKey,recipient);}catch{}
  setBusy(true);stop.current=false;setError("");setInfo("");
  setProgress({done:0,total:selection.length});
  let done=0,failed=false;
  for(const row of selection){
   if(stop.current)break;
   try{
    const res=await fetch(endpoint,{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({action:"send-document",documentId:row.document.id,
      recipient,recipientConfirmation:recipient,confirmed:true})
    });
    const reply=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(reply.error||"Sendestatus er ukjent.");
    done++;
    setProgress({done,total:selection.length});
    // Accepted documents disappear from the pending queue after a server refresh.
    // "Accepted" does NOT claim that Tripletex has imported the document.
    await load();
   }catch(e){
    setError("Overføringen stoppet ved "+description(row)+": "+
     (e.message||"Ukjent feil.")+" Kontroller Tripletex før du forsøker noe mer.");
    failed=true;stop.current=true;break;
   }
  }
  try{await load();}catch(e){setError(e.message);}
  if(!failed&&done>0){
   setInfo(done+" bilag akseptert av e-posttjenesten og fjernet fra listen «Ikke overført». "+
    "Kontroller at "+(done===1?"det":"de")+" er mottatt i Tripletex før bokføring.");
  }else if(failed&&done>0){
   setInfo(done+" bilag ble akseptert før sendingen stoppet. De er flyttet til sendingshistorikken.");
  }
  setBusy(false);
 }

 const originalLink=row=>row.attachment?
  <a className={styles.link} href={"/api/admin/invoices/vat-attachments?documentId="+
   encodeURIComponent(row.document.id)+"&download=1"}>Vis original</a>:null;
 return <div className={styles.shell} id="tripletex-kvitteringer">
  <header className={styles.head}>
   <h2 style={{fontSize:22,margin:"0 0 7px"}}>Kvitteringer og leverandørbilag</h2>
   <p>Kun bilag som ikke er sendt ligger i arbeidslisten. Sendte bilag tas vare på i historikken.</p>
  </header>
  {summary&&<div className={styles.stats}>
   <div className={styles.stat}><strong>{remaining.length}</strong><span>Ikke overført</span></div>
   <div className={styles.stat}><strong>{sent.length}</strong><span>Sendt til e-bilagsmottak</span></div>
   <div className={styles.stat}><strong>{needsReview.length}</strong><span>Trenger kontroll</span></div>
  </div>}
  {loading&&<p role="status">Henter kvitteringer …</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {info&&<p role="status" className={styles.progress}>{info}</p>}
  {!loading&&<>
   <section className={styles.section}>
    <h2>Mottaker i Tripletex</h2>
    <div className={styles.recipientRow}>
     <label>E-bilagsadresse
      <input type="email" spellCheck={false} autoComplete="off" value={address}
       disabled={busy||Boolean(lockedRecipient)} onChange={e=>setAddress(e.target.value)}/>
     </label>
     {lockedRecipient&&<p className={styles.hint}>Tidligere benyttet adresse – låst for å unngå feil mottaker.</p>}
    </div>
    {!canSend&&<p className={styles.error}>Bruk riktig adresse fra bilagsmottaket (@ebilag.com).</p>}
    <p className={styles.hint}>Adressen er ferdig utfylt. Ved overføring bekrefter du selve sendingen én gang. Dette sender originalen til bilagsmottaket, men bokfører ikke kjøpet.</p>
   </section>
   <section className={styles.section}>
    <h2>Ikke overført ({remaining.length})</h2>
    {remaining.length===0?<p className={styles.empty}>Ingen usendte kvitteringer. Alle bilag er enten sendt eller ligger til kontroll.</p>:<>
     <p className={styles.hint}>Velg «Overfør til Tripletex» på et enkelt bilag, eller overfør resten samlet når du har kontrollert at en prøvekvittering er mottatt.</p>
     <div className={styles.actions}>
      {eligible.length>1&&summary?.acceptedByEmailProvider>0&&
       <label className={styles.check}><input type="checkbox" checked={confirmedFirstInTripletex}
        disabled={busy} onChange={e=>setConfirmedFirstInTripletex(e.target.checked)}/>
        <span>Jeg har kontrollert at en prøvekvittering faktisk vises i Tripletex sitt bilagsmottak.</span>
       </label>}
      {eligible.length>1&&!summary?.acceptedByEmailProvider&&
       <p className={styles.hint}>Start med én kvittering. Når den vises i Tripletex, kan du overføre resten samlet.</p>}
      <button type="button" className={styles.primary} disabled={!canSend||!eligible.length||busy||!bulkPermitted}
       onClick={()=>transfer({firstOnly:false})}>
       {busy?"Overfører …":"Overfør "+eligible.length+" usendte bilag til Tripletex"}
      </button>
      {busy&&<button type="button" onClick={()=>{stop.current=true;setInfo("Stopper etter pågående bilag …");}}>
       Stopp etter dette bilaget
      </button>}
     </div>
     {busy&&<p role="status" className={styles.progress}>{progress.done} av {progress.total} akseptert av e-posttjenesten.</p>}
     <div className={styles.list}>{remaining.map(row=><div key={row.document.id} className={styles.item}>
      <div className={styles.itemInfo}>
       <strong>{row.document.supplier_name||"Ukjent leverandør"}</strong>
       <small>{row.document.document_date} · {row.document.supplier_document_number}
        {row.document.kind==="credit"?" · Kreditnota":""}</small>
       <small>{row.attachment?.original_filename||"Original mangler"}</small>
       {!supported(row.attachment)&&<small className={styles.error}>
        {row.attachment?"Formatet må være PDF/JPG/PNG":"Mangler originalvedlegg"}</small>}
      </div>
      <div className={styles.itemLinks}>
       <button type="button" className={styles.primary} disabled={busy||!canSend||!supported(row.attachment)}
        onClick={()=>transfer({documentId:row.document.id})}>Overfør til Tripletex</button>
       {originalLink(row)}
      </div>
     </div>)}</div>
    </>}
   </section>
   {needsReview.length>0&&<section className={styles.section}>
    <h2>Må kontrolleres ({needsReview.length})</h2>
    <p role="alert" className={styles.error}>Disse har et sendeforsøk med ukjent utfall. De sendes aldri automatisk på nytt. Kontroller e-bilagsmottaket og e-postloggen.</p>
    <div className={styles.list}>{needsReview.map(row=><div className={styles.item} key={row.document.id}>
     <div className={styles.itemInfo}><strong>{description(row)}</strong>
      <small>{row.transfer.status==="sending"?"Sendeforsøk pågår eller ble avbrutt":"Uklart sendeforsøk"}</small>
     </div>
     <div className={styles.itemLinks}>{originalLink(row)}</div>
    </div>)}</div>
   </section>}
   <section className={styles.section}>
    <details>
     <summary className={styles.historyToggle}>Sendingshistorikk ({sent.length})</summary>
     <p className={styles.hint}>«Sendt» betyr at e-posttjenesten aksepterte bilaget. Mottak og bokføring må bekreftes i Tripletex.</p>
     {sent.length? <div className={styles.list}>{sent.map(row=><div className={styles.item} key={row.document.id}>
      <div className={styles.itemInfo}><strong>{row.document.supplier_name}</strong>
       <small>{row.document.document_date} · {row.document.supplier_document_number}</small>
       <small>Akseptert av e-posttjenesten · {row.transfer.recipient}</small>
      </div>
      <div className={styles.itemLinks}>{originalLink(row)}</div>
     </div>)}</div>:<p className={styles.empty}>Ingen bilag sendt ennå.</p>}
    </details>
    <div className={styles.actions}>
     <a className={styles.link} href={endpoint+"?format=csv"}>Last ned komplett bilagsoversikt (CSV)</a>
    </div>
    <p className={styles.hint}>Oversikten inkluderer alle bilag, også de som er sendt. Slik kan du alltid ettergå historikken.</p>
   </section>
  </>}
 </div>;
}
