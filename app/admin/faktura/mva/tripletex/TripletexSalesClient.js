"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import {tripletexCustomerInvoiceQueue} from "../../../../../lib/tripletexCustomerInvoiceQueue";

const base="/api/admin/invoices/tripletex/sales";
const transferApi=base+"/transfer";
const euro=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const validType=x=>/^[A-Za-z0-9_-]{1,32}$/.test(String(x||"").trim());
const moneyKind=state=>state==="unpaid"?"Ubetalt – kan klargjøres":
 state==="paid"?"Betalt – velg betalingstype":"Må kontrolleres";
const fileDownload=url=>{
 // Using a real link click preserves the browser's native download behavior.
 const a=document.createElement("a");
 a.href=url;
 a.setAttribute("download","");
 document.body.appendChild(a);a.click();a.remove();
};

export default function TripletexSalesClient(){
 const [invoices,setInvoices]=useState([]),[transfers,setTransfers]=useState([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [startNumber,setStartNumber]=useState("80000000");
 const [paymentTypeVipps,setPaymentTypeVipps]=useState("");
 const [paymentTypeOther,setPaymentTypeOther]=useState("");
 const [showHistory,setShowHistory]=useState(false);
 const [includePaid,setIncludePaid]=useState(false);
 const [search,setSearch]=useState("");
 const [confirmedNumbers,setConfirmedNumbers]=useState(false);

 const reload=useCallback(async()=>{
  const [list,history]=await Promise.all([
   fetch(base,{cache:"no-store"}),fetch(transferApi,{cache:"no-store"})
  ]);
  const [data,log]=await Promise.all([
   list.json().catch(()=>({})),history.json().catch(()=>({}))
  ]);
  if(!list.ok||!history.ok)
   throw Error(data.error||log.error||"Kunne ikke hente komplett overføringsstatus.");
  setInvoices(data.rows||[]);setTransfers(log.transfers||[]);
 },[]);
 useEffect(()=>{
  let active=true;
  reload().catch(err=>{if(active)setError(err.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[reload]);

 const queue=useMemo(()=>tripletexCustomerInvoiceQueue(invoices,transfers),[invoices,transfers]);
 const maxReserved=transfers.reduce((max,x)=>Math.max(max,Number(x.import_number)||0),0);
 const numericStart=Number(startNumber);
 const numberValid=Number.isSafeInteger(numericStart)&&numericStart>=10001&&numericStart<=999999999;
 const nextNumber=numberValid?Math.max(numericStart,maxReserved+1):null;
 const needsVipps=queue.pending.some(x=>x.state==="paid"&&x.paymentSource==="vipps");
 const needsOther=queue.pending.some(x=>x.state==="paid"&&x.paymentSource==="other");
 const paidTypeReady=(!needsVipps||validType(paymentTypeVipps))&&
  (!needsOther||validType(paymentTypeOther));
 const available=queue.pending.filter(x=>includePaid||x.state==="unpaid");
 const canPrepare=numberValid&&confirmedNumbers&&!busy;
 const allPending=queue.pending.length+queue.prepared.length+queue.needsReview.length;
 const matches=x=>[x.originalNumber,x.customerName,x.state,
  x.transfer?.import_number].some(value=>String(value||"")
   .toLocaleLowerCase("nb-NO").includes(search.trim().toLocaleLowerCase("nb-NO")));
 const workItems=[...queue.prepared,...queue.pending,...queue.needsReview].filter(matches);
 const completed=queue.confirmed.filter(matches);

 async function post(payload){
  const response=await fetch(transferApi,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(payload)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"Handling kunne ikke fullføres.");
  return result;
 }
 async function prepare(ids){
  if(!canPrepare||!ids.length||!nextNumber)return;
  const selected=invoices.filter(row=>ids.includes(row.id));
  if(selected.length!==ids.length)return;
  const actuallyPaid=selected.filter(x=>x.state==="paid");
  if(actuallyPaid.some(x=>x.paymentSource==="vipps"&&!validType(paymentTypeVipps)||
   x.paymentSource==="other"&&!validType(paymentTypeOther))){
   setError("Legg inn korrekt betalingsform Import-ID fra Tripletex for hver betalte faktura.");
   return;
  }
  if(nextNumber+ids.length-1>999999999){
   setError("Du må velge en annen importnummerserie.");return;
  }
  const selectedDescription=ids.length===1?
   selected[0].originalNumber+" – "+selected[0].customerName:
   ids.length+" kundefakturaer";
  if(!window.confirm("Klargjør "+selectedDescription+" for Tripletex med importnummer "+
   nextNumber+(ids.length>1?" og videre":"")+"?\n\nDu må først kontrollere at fakturaene ikke finnes i Tripletex og at nummerserien er ledig.\n\nDette laster ned en importfil, men bokfører ingenting automatisk."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const result=await post({action:"prepare",invoiceIds:ids,startNumber:nextNumber,
    paymentTypeVipps:paymentTypeVipps.trim(),paymentTypeOther:paymentTypeOther.trim()});
   await reload();
   fileDownload(result.downloadUrl);
   setMessage("Importfilen er klargjort og nedlasting startet. Importer CSV-filen i Tripletex, "+
    "kontroller fakturaene og bekreft først deretter at de er importert.");
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function confirm(rows){
  if(busy||rows.length===0)return;
  const numbers=rows.map(x=>Number(x.transfer.import_number));
  const label=rows.length===1?
   "faktura "+rows[0].originalNumber+" (Tripletex "+numbers[0]+")":
   rows.length+" fakturaer (Tripletex-numre "+numbers.join(", ")+")";
  if(!window.confirm("Har du funnet "+label+
   " i Fakturaoversikt i Tripletex og kontrollert at beløp og kunde stemmer?\n\nKun hvis importen faktisk er fullført, markerer vi dem som overført og fjerner dem fra arbeidslisten."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await post({action:"confirm",invoiceIds:rows.map(x=>x.id),
    importNumbers:numbers,confirmed:true});
   await reload();
   setMessage(response.count+" faktura(er) er merket importert etter din bekreftelse og flyttet til historikken.");
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const groups=Object.values(queue.prepared.reduce((out,row)=>{
  const batch=row.transfer.batch_id;
  (out[batch] ||= []).push(row);
  return out;
 },{}));
 return <section className={styles.section} style={{marginBottom:26}}>
  <h2 style={{fontSize:22,margin:"0 0 9px"}}>Utsendte kundefakturaer til Tripletex</h2>
  <p className={styles.hint}>Dette er fakturaer du allerede har sendt til kunder fra Aadland Service.
   Her klargjør du riktig CSV-import og flytter bare fakturaer du faktisk har kontrollert i Tripletex ut av arbeidslisten.
   <strong> Ingen faktura sendes til kunden på nytt.</strong></p>
  {loading&&<p role="status">Henter fakturaene og overføringslisten …</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {message&&<p role="status" className={styles.progress}>{message}</p>}
  {!loading&&<>
   <div className={styles.stats}>
    <div className={styles.stat}><strong>{allPending}</strong><span>Ikke overført</span></div>
    <div className={styles.stat}><strong>{queue.prepared.length}</strong><span>CSV klargjort, avventer bekreftelse</span></div>
    <div className={styles.stat}><strong>{queue.confirmed.length}</strong><span>Import bekreftet av deg</span></div>
   </div>
   <div className={styles.section}>
    <h3 style={{fontSize:17,margin:"0 0 8px"}}>Enkelt oppsett for import</h3>
    <p className={styles.hint}>Tripletex bruker en egen numerisk fakturanummerserie ved import.
     Kontroller at intervallet er ledig. Ditt originale fakturanummer forblir uendret og følger med i importkommentaren.</p>
    <div className={styles.inputs}>
     <label>Startnummer i Tripletex
      <input type="number" min="10001" max="999999999" step="1"
       value={startNumber} onChange={e=>{setStartNumber(e.target.value);setConfirmedNumbers(false)}} disabled={busy}/>
     </label>
    </div>
    {numberValid&&nextNumber>numericStart&&<p className={styles.hint}>
     Neste ledige nummer i Aadland Service sin overføringslogg blir <strong>{nextNumber}</strong>.
     Sjekk også at nummeret er ledig inne i Tripletex.</p>}
    {!numberValid&&<p className={styles.error}>Skriv et gyldig startnummer, minst 10001.</p>}
    <label className={styles.check}><input type="checkbox" checked={includePaid} disabled={busy}
     onChange={e=>{setIncludePaid(e.target.checked);setConfirmedNumbers(false);}}/>
     <span>Inkluder også betalte og delbetalte fakturaer</span>
    </label>
    {includePaid&&<div className={styles.inputs}>
     {needsVipps&&<label>Vipps – betalingstype Import-ID fra Tripletex
      <input type="text" value={paymentTypeVipps} disabled={busy} maxLength={32}
       placeholder="Vipps sin Import-ID" onChange={e=>setPaymentTypeVipps(e.target.value)}/>
     </label>}
     {needsOther&&<label>Bank/annen betaling – Import-ID fra Tripletex
      <input type="text" value={paymentTypeOther} disabled={busy} maxLength={32}
       placeholder="Betalingstypens Import-ID" onChange={e=>setPaymentTypeOther(e.target.value)}/>
     </label>}
    </div>}
    <label className={styles.check}>
     <input type="checkbox" checked={confirmedNumbers} onChange={e=>setConfirmedNumbers(e.target.checked)} disabled={busy}/>
     <span>Jeg har kontrollert at disse fakturaene ikke allerede er i Tripletex, og at importnumrene er ledige.</span>
    </label>
    <div className={styles.actions}>
     <button type="button" className={styles.primary}
      disabled={!canPrepare||!available.length||!paidTypeReady&&includePaid}
      onClick={()=>prepare(available.map(x=>x.id))}>
      {busy?"Klargjør import …":"Overfør alle "+available.length+" klare kundefakturaer"}
     </button>
    </div>
    <p className={styles.hint}>Knappen laster ned en samlet Tripletex-CSV. Last den opp under
     <strong> Faktura → Import/eksport → Fakturaimport</strong> i Tripletex.
     Ikke velg «Beløp inkl. MVA». Importerte fakturaer blir ikke sendt til kundene på nytt.
     <a className={styles.link} target="_blank" rel="noreferrer" href="https://hjelp.tripletex.no/hc/no/articles/16015924686225-Slik-importerer-du-en-faktura"> Se veiledning fra Tripletex</a>.</p>
   </div>
   <div className={styles.section}>
    <h3 style={{fontSize:19,marginBottom:9}}>Ikke overført ({allPending})</h3>
    <label style={{display:"grid",gap:5,maxWidth:440,fontSize:12,fontWeight:650}}>
     Søk etter kunde eller fakturanummer
     <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Søk blant fakturaene"
      style={{padding:"10px 12px",minHeight:43,background:"#fff",color:"#222",borderRadius:9,border:"1px solid #c9c3b9"}}/>
    </label>
    {groups.map(group=>group.length>1&&
     <div key={group[0].transfer.batch_id} className={styles.actions}>
      <a className={styles.link} href={transferApi+"?format=csv&batchId="+group[0].transfer.batch_id}>
       Last ned felles importfil ({group.length} fakturaer)</a>
      <button type="button" className={styles.primary} disabled={busy}
       onClick={()=>confirm(group)}>Jeg har importert disse {group.length} i Tripletex</button>
     </div>)}
    <div className={styles.list}>
     {workItems.map(x=><div className={styles.item} key={x.id}>
      <div className={styles.itemInfo}>
       <strong>{x.originalNumber} · {x.customerName}</strong>
       <small>{x.issuedDate} · {euro(x.grossOre)} · Betalt {euro(x.paidOre)}
        {" · "}Gjenstår {euro(x.outstandingOre)}</small>
       <small>{x.transfer?.status==="prepared"?
        "Importfil klargjort – ikke bekreftet i Tripletex":
        moneyKind(x.state)+". "+x.reason}</small>
       {x.transfer&&<small>Reservert Tripletex-fakturanummer: {x.transfer.import_number}</small>}
      </div>
      <div className={styles.itemLinks}>
       {x.transfer?.status==="prepared"?<>
        <a className={styles.link} href={transferApi+"?format=csv&batchId="+x.transfer.batch_id}>Last ned importfil</a>
        <button type="button" className={styles.primary} disabled={busy}
         onClick={()=>confirm([x])}>Bekreft importert</button>
       </>:x.state!=="review"?<button type="button" className={styles.primary}
        disabled={!canPrepare||x.state==="paid"&&(!includePaid||
         x.paymentSource==="vipps"&&!validType(paymentTypeVipps)||
         x.paymentSource==="other"&&!validType(paymentTypeOther))}
        onClick={()=>prepare([x.id])}>Overfør til Tripletex</button>:
        <span className={styles.error}>Må kontrolleres manuelt</span>}
       {x.hasPdf&&<a className={styles.link}
        href={"/api/admin/invoices/pdf?id="+encodeURIComponent(x.id)}
        target="_blank" rel="noreferrer">Original faktura-PDF</a>}
      </div>
     </div>)}
     {!workItems.length&&<p className={styles.empty}>
      {allPending?"Ingen treff. Endre søket for å vise resten.":"Ingen fakturaer som gjenstår å overføre."}
     </p>}
    </div>
   </div>
   <div className={styles.section}>
    <details open={showHistory} onToggle={e=>setShowHistory(e.currentTarget.open)}>
     <summary className={styles.historyToggle}>Overføringshistorikk ({queue.confirmed.length})</summary>
     <p className={styles.hint}>Fakturaene her er markert som importert etter din bekreftelse. De er ikke automatisk verifisert mot Tripletex API.</p>
     <div className={styles.list}>{completed.map(x=><div className={styles.item} key={x.id}>
      <div className={styles.itemInfo}><strong>{x.originalNumber} · {x.customerName}</strong>
       <small>Tripletex fakturanr. {x.transfer.import_number} · Bekreftet {new Date(x.transfer.confirmed_at).toLocaleDateString("nb-NO")}</small>
      </div>
      <div className={styles.itemLinks}>
       <span className={styles.hint}>Import bekreftet</span>
       {x.hasPdf&&<a className={styles.link} href={"/api/admin/invoices/pdf?id="+encodeURIComponent(x.id)}>Original-PDF</a>}
      </div>
     </div>)}
     {!completed.length&&<p className={styles.empty}>Ingen fakturaer er bekreftet importert ennå.</p>}
     </div>
    </details>
   </div>
   <div className={styles.section}>
    <h3 style={{fontSize:17,marginBottom:8}}>Sikkerhetskopi av alle sendte fakturaer</h3>
    <div className={styles.actions}>
     <a className={styles.link} href={base+"?format=pdfzip"}>Last ned alle originale PDF-er (ZIP)</a>
     <a className={styles.link} href={base+"?format=archive"}>Last ned faktura- og betalingsoversikt (CSV)</a>
    </div>
   </div>
  </>}
 </section>;
}
