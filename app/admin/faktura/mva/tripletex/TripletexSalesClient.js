"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import styles from "./TripletexReceipts.module.css";
import {tripletexCustomerInvoiceQueue,tripletexCustomerInvoiceSelections} from "../../../../../lib/tripletexCustomerInvoiceQueue";

const base="/api/admin/invoices/tripletex/sales";
const transferApi=base+"/transfer";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const validType=value=>/^[A-Za-z0-9_-]{1,32}$/.test(String(value||"").trim());
const fileDownload=url=>{
 const a=document.createElement("a");
 a.href=url;a.setAttribute("download","");
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
 const [search,setSearch]=useState("");
 const csvSettingsRef=useRef(null);

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
 const selections=useMemo(()=>tripletexCustomerInvoiceSelections(queue),[queue]);
 const withPayment=selections.withPayment;
 const withoutPayment=selections.withoutPayment;
 const maxReserved=transfers.reduce((max,x)=>Math.max(max,Number(x.import_number)||0),0);
 const numericStart=Number(startNumber);
 const numberValid=Number.isSafeInteger(numericStart)&&numericStart>=10001&&numericStart<=999999999;
 const nextNumber=numberValid?Math.max(numericStart,maxReserved+1):null;
 const needsVipps=withPayment.some(x=>x.paymentSource==="vipps");
 const needsOther=withPayment.some(x=>x.paymentSource==="other");
 const canPrepare=numberValid&&!busy;
 const allPending=queue.pending.length+queue.prepared.length+queue.needsReview.length;
 const matches=x=>[x.originalNumber,x.customerName,x.state,x.transfer?.import_number]
  .some(value=>String(value||"").toLocaleLowerCase("nb-NO")
   .includes(search.trim().toLocaleLowerCase("nb-NO")));
 const paidVisible=withPayment.filter(matches);
 const unpaidVisible=withoutPayment.filter(matches);
 const preparedVisible=queue.prepared.filter(matches);
 const reviewVisible=queue.needsReview.filter(matches);
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
 async function prepare(ids,mode){
  if(!canPrepare||!nextNumber||!ids.length)return;
  const allowed=mode==="paid-batch"?withPayment:mode==="unpaid-single"?withoutPayment:[];
  if(mode==="unpaid-single"&&ids.length!==1)return;
  const selected=allowed.filter(row=>ids.includes(row.id));
  if(selected.length!==ids.length||new Set(ids).size!==ids.length)return;
  if(mode==="paid-batch"&&selected.some(x=>
   x.paymentSource==="vipps"&&!validType(paymentTypeVipps)||
   x.paymentSource==="other"&&!validType(paymentTypeOther))){
   setError("Fyll inn riktig betalingstype-ID for Vipps og/eller bank i «Avansert – manuell CSV-import» først.");
   csvSettingsRef.current.open=true;
   window.requestAnimationFrame(()=>csvSettingsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
   return;
  }
  if(nextNumber+ids.length-1>999999999){
   setError("Velg en lavere importnummerserie under «Avansert – manuell CSV-import».");
   csvSettingsRef.current.open=true;
   window.requestAnimationFrame(()=>csvSettingsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
   return;
  }
  const description=mode==="paid-batch"?
   ids.length+" fakturaer med registrert innbetaling":
   "den ubetalte fakturaen "+selected[0].originalNumber+" – "+selected[0].customerName;
  if(!window.confirm("Klargjøre "+description+" for Tripletex med importnummer "+
   nextNumber+(ids.length>1?" og videre":"")+"?\n\n"+
   "Jeg bekrefter at disse fakturaene IKKE allerede finnes i Tripletex, og at importnumrene er ledige.\n\n"+
   "Filen lastes ned til PC-en. Du må fortsatt importere CSV-filen i Tripletex. Ingen faktura sendes på nytt til kunden."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const result=await post({action:"prepare",mode,invoiceIds:ids,startNumber:nextNumber,
    paymentTypeVipps:paymentTypeVipps.trim(),paymentTypeOther:paymentTypeOther.trim()});
   await reload();
   fileDownload(result.downloadUrl);
   setMessage("Importfilen for "+ids.length+" faktura(er) er klargjort. Den ligger også under «Klargjort – avventer import». "+
    "Last opp CSV i Tripletex, kontroller at fakturaene finnes der og bekreft importen etterpå.");
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function confirm(rows){
  if(busy||rows.length===0)return;
  const numbers=rows.map(x=>Number(x.transfer.import_number));
  const label=rows.length===1?
   "faktura "+rows[0].originalNumber+" (Tripletex "+numbers[0]+")":
   rows.length+" fakturaer (Tripletex-numre "+numbers.join(", ")+")";
  if(!window.confirm("Har du funnet "+label+
   " i Fakturaoversikt i Tripletex og kontrollert at kunde, beløp og eventuell innbetaling stemmer?\n\n"+
   "Bare hvis importen faktisk er fullført, markerer vi fakturaene som overført og flytter dem til historikken."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await post({action:"confirm",invoiceIds:rows.map(x=>x.id),
    importNumbers:numbers,confirmed:true});
   await reload();
   setMessage(response.count+" faktura(er) ble markert importert etter din bekreftelse og flyttet til historikken.");
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const groups=Object.values(queue.prepared.reduce((out,row)=>{
  (out[row.transfer.batch_id] ||= []).push(row);
  return out;
 },{}));

 const invoiceSummary=x=><>
  <strong>{x.originalNumber} · {x.customerName}</strong>
  <small>{x.issuedDate} · Fakturert {money(x.grossOre)} · Innbetalt {money(x.paidOre)}
   {" · "}Gjenstår {money(x.outstandingOre)}</small>
 </>;
 const originalLink=x=>x.hasPdf&&<a className={styles.link}
  href={"/api/admin/invoices/pdf?id="+encodeURIComponent(x.id)}
  target="_blank" rel="noreferrer">Original faktura (PDF)</a>;

 return <section className={styles.section} id="tripletex-fakturaer">
  <h2 style={{fontSize:24,margin:"0 0 8px"}}>Kundefakturaer til Tripletex</h2>
  <p className={styles.hint}>Fakturaene er allerede sendt til kundene fra Aadland Service.
   Du kan overføre <strong>alle med registrert innbetaling samlet</strong>, mens du selv velger
   hvilke <strong>uten innbetaling</strong> du vil klargjøre én og én.
   <strong>Direkte API-overføring er ikke aktiv ennå.</strong> Knappene under klargjør derfor en CSV-fil
   som du importerer manuelt i Tripletex. Oppsettet for denne filen ligger skjult under «Avansert».</p>
  {loading&&<p role="status">Henter fakturaer og overføringsstatus …</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {message&&<p role="status" className={styles.progress}>{message}</p>}
  {!loading&&<>
   <div className={styles.stats}>
    <div className={styles.stat}><strong>{allPending}</strong><span>Gjenstår å importere eller kontrollere</span></div>
    <div className={styles.stat}><strong>{queue.prepared.length}</strong><span>CSV klargjort, avventer bekreftelse</span></div>
    <div className={styles.stat}><strong>{queue.confirmed.length}</strong><span>Bekreftet importert</span></div>
   </div>

   <div className={styles.section}>
    <details className={styles.importSettings} ref={csvSettingsRef}>
     <summary className={styles.historyToggle}>Avansert – manuell CSV-import</summary>
     <p className={styles.hint}>Du bruker en ledig numerisk nummerserie i Tripletex.
      De opprinnelige Aadland-fakturanumrene endres ikke. Kontroller at importnumrene ikke er brukt der fra før.</p>
     <div className={styles.inputs}>
      <label>Startnummer i Tripletex
       <input type="number" min="10001" max="999999999" step="1"
        value={startNumber} disabled={busy} onChange={e=>setStartNumber(e.target.value)}/>
      </label>
      {needsVipps&&<label>Vipps – betalingstype Import-ID fra Tripletex
       <input type="text" maxLength={32} placeholder="F.eks. ID for Vipps-betaling"
        disabled={busy} value={paymentTypeVipps} onChange={e=>setPaymentTypeVipps(e.target.value)}/>
      </label>}
      {needsOther&&<label>Bank/annen innbetaling – betalingstype Import-ID
       <input type="text" maxLength={32} placeholder="ID for bank/annen betaling"
        disabled={busy} value={paymentTypeOther} onChange={e=>setPaymentTypeOther(e.target.value)}/>
      </label>}
     </div>
     {numberValid&&nextNumber>numericStart&&<p className={styles.hint}>
      Neste tilgjengelige nummer i Aadland Service sin overføringslogg er <strong>{nextNumber}</strong>.
      Dette er ikke bekreftet ledig i Tripletex.</p>}
     {!numberValid&&<p className={styles.error}>Velg et gyldig importnummer fra 10001 til 999999999.</p>}
     <p className={styles.hint}>Betalte og delbetalte fakturaer må ha riktig betalingsform-ID i Tripletex, slik at
      Vipps og bank ikke bokføres på feil konto. Manglende ID stopper klargjøringen.</p>
    </details>
   </div>

   <div className={styles.section}>
    <h3 style={{fontSize:20,margin:"0 0 8px"}}>Fakturaer med innbetaling ({withPayment.length})</h3>
    <p className={styles.hint}>Alle fakturaer med registrert og avstemt betaling – også delbetalte – samles
     i én CSV-fil. Fakturaer med usikkert oppgjør holdes utenfor. Når Tripletex API er klart,
     kan vi erstatte den manuelle importen.</p>
    <div className={styles.actions}>
     <button type="button" className={styles.primary}
      disabled={!canPrepare||!withPayment.length}
      onClick={()=>prepare(withPayment.map(x=>x.id),"paid-batch")}>
      {busy?"Klargjør fakturaer …":
       "Overfør fakturaer med innbetaling ("+withPayment.length+") – CSV"}
     </button>
    </div>
    <div className={styles.list}>
     {withPayment.map(x=><div className={styles.item} key={x.id}>
      <div className={styles.itemInfo}>{invoiceSummary(x)}
       <small>{x.outstandingOre>0?"Delbetalt":"Betalt"} · {x.paymentSource==="vipps"?"Vipps":"Bank/annen"}</small>
      </div>
      <div className={styles.itemLinks}>{originalLink(x)}</div>
     </div>)}
     {!withPayment.length&&<p className={styles.empty}>Ingen klare fakturaer med innbetaling gjenstår.</p>}
    </div>
   </div>

   <div className={styles.section}>
    <h3 style={{fontSize:20,margin:"0 0 8px"}}>Fakturaer uten innbetaling ({withoutPayment.length})</h3>
    <p className={styles.hint}>Disse tas <strong>ikke med i samlefilen</strong>. Velg en faktura om gangen.
     Foreløpig klargjøres en manuell CSV-import. Når du retter kundekortet fra en ubetalt faktura,
     sendes nye kontaktopplysninger automatisk til den allerede koblede Tripletex-kunden.
     <strong> Selve utstedte fakturaen endres ikke.</strong> Beløp, MVA eller fakturadato krever
     regnskapsmessig korrigering, ikke overskriving.</p>
    <div className={styles.list}>
     {withoutPayment.map(x=><div key={x.id} className={styles.item}>
      <div className={styles.itemInfo}>{invoiceSummary(x)}</div>
      <div className={styles.itemLinks}>
       <a className={styles.link} href={"/admin/faktura/arkiv?id="+encodeURIComponent(x.id)}>
        Åpne ubetalt faktura</a>
       <button className={styles.primary} disabled={!canPrepare} type="button"
        onClick={()=>prepare([x.id],"unpaid-single")}>Overfør denne fakturaen – CSV</button>
       {originalLink(x)}
      </div>
     </div>)}
     {!withoutPayment.length&&<p className={styles.empty}>Ingen ubetalte fakturaer som gjenstår å overføre.</p>}
    </div>
   </div>

   {queue.prepared.length>0&&<div className={styles.section}>
    <h3 style={{fontSize:19,marginBottom:7}}>Klargjort – avventer import i Tripletex ({queue.prepared.length})</h3>
    <p className={styles.hint}>Filene er klargjort, men de er <strong>ikke bekreftet importert</strong>.
     Last ned CSV-filen og last den opp under Faktura → Import/eksport → Fakturaimport i Tripletex.
     Ikke velg «Beløp inkl. MVA» ved import.</p>
    {groups.map(group=>group.length>1&&<div className={styles.actions} key={group[0].transfer.batch_id}>
     <a className={styles.link} href={transferApi+"?format=csv&batchId="+group[0].transfer.batch_id}>
      Last ned felles importfil ({group.length} fakturaer)</a>
     <button type="button" className={styles.primary} disabled={busy} onClick={()=>confirm(group)}>
      Bekreft importert ({group.length})</button>
    </div>)}
    <div className={styles.list}>{preparedVisible.map(x=><div className={styles.item} key={x.id}>
     <div className={styles.itemInfo}>{invoiceSummary(x)}
      <small>Importnummer i Tripletex: {x.transfer.import_number}</small>
     </div>
     <div className={styles.itemLinks}>
      <a className={styles.link} href={transferApi+"?format=csv&batchId="+x.transfer.batch_id}>Last ned importfil</a>
      <button type="button" className={styles.primary} disabled={busy} onClick={()=>confirm([x])}>Bekreft importert</button>
      {originalLink(x)}
     </div>
    </div>)}</div>
   </div>}

   {queue.needsReview.length>0&&<div className={styles.section}>
    <h3 style={{fontSize:19,marginBottom:7}}>Krever kontroll ({queue.needsReview.length})</h3>
    <p className={styles.hint}>Disse fakturaene har opplysninger som må avstemmes før import.
     De tas verken med i den samlede betalingsfilen eller blant ubetalte som kan overføres.</p>
    <div className={styles.list}>{reviewVisible.map(x=><div className={styles.item} key={x.id}>
     <div className={styles.itemInfo}>{invoiceSummary(x)}<small>{x.reason}</small></div>
     <div className={styles.itemLinks}>{originalLink(x)}</div>
    </div>)}</div>
   </div>}

   <div className={styles.section}>
    <details open={showHistory} onToggle={e=>setShowHistory(e.currentTarget.open)}>
     <summary className={styles.historyToggle}>Overføringshistorikk ({queue.confirmed.length})</summary>
     <p className={styles.hint}>Her vises bare fakturaer du har bekreftet importert.
      Statusen er din bekreftelse, ikke en automatisk API-kontroll fra Tripletex.</p>
     <div className={styles.list}>{completed.map(x=><div className={styles.item} key={x.id}>
      <div className={styles.itemInfo}><strong>{x.originalNumber} · {x.customerName}</strong>
       <small>Tripletex-fakturanr. {x.transfer.import_number}
        {" · "}Bekreftet {new Date(x.transfer.confirmed_at).toLocaleDateString("nb-NO")}</small>
      </div>
      <div className={styles.itemLinks}>{originalLink(x)}</div>
     </div>)}
     {!completed.length&&<p className={styles.empty}>Ingen bekreftede fakturaimporter ennå.</p>}
     </div>
    </details>
   </div>

   <div className={styles.section}>
    <h3 style={{fontSize:17,marginBottom:7}}>Finn fakturaer og ta sikkerhetskopi</h3>
    <label style={{display:"grid",gap:5,maxWidth:430,fontSize:13,fontWeight:650}}>
     Søk etter kunde eller fakturanummer
     <input type="search" placeholder="Søk i klargjorte fakturaer og historikk"
      value={search} onChange={e=>setSearch(e.target.value)}
      style={{padding:"10px 12px",minHeight:43,background:"#fff",color:"#222",borderRadius:9,border:"1px solid #c9c3b9"}}/>
    </label>
    <div className={styles.actions}>
     <a className={styles.link} href={base+"?format=pdfzip"}>Last ned alle originalfakturaer (ZIP)</a>
     <a className={styles.link} href={base+"?format=archive"}>Last ned faktura- og betalingsoversikt (CSV)</a>
    </div>
   </div>
  </>}
 </section>;
}
