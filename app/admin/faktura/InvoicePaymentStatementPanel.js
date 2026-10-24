"use client";
import {useEffect,useState} from "react";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {invoiceSettlementInfo} from "../../../lib/invoiceSettlementInfo";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
 .format((Number(ore)||0)/100);
export default function InvoicePaymentStatementPanel({invoice,today}){
 const [records,setRecords]=useState([]),[canSend,setCanSend]=useState(false),
  [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),
  [error,setError]=useState(""),[notice,setNotice]=useState(""),[retry,setRetry]=useState(0);
 const id=invoice.id,settlement=invoiceSettlementInfo(invoice,today);
 const amounts=invoicePaymentState(invoice,today);
 const hasActivity=amounts.paid>0||amounts.credited>0;
 const blocked=["activeVipps","mismatch"].includes(settlement.kind);
 const base="/api/admin/invoices/payment-statements?invoiceId="+encodeURIComponent(id);
 useEffect(()=>{
  let active=true;setRecords([]);setCanSend(false);setLoading(true);setError("");setNotice("");
  fetch(base+"&mode=history",{cache:"no-store"}).then(async r=>{
   const d=await r.json();if(!r.ok)throw Error(d.error||"Oversikter kunne ikke hentes.");
   if(active){setRecords(d.statements||[]);setCanSend(d.canSend===true);}
  }).catch(e=>{if(active)setError(e.message||"Oversikter kunne ikke hentes.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[id,invoice.payment_updated_at,invoice.credited_ore,retry]);
 async function send(){
  if(busy||!canSend||blocked||!hasActivity)return;
  const email=String(invoice.customer?.email||"").trim();
  if(!email){setError("Kunden mangler e-postadresse. Oppdater kundekortet.");return;}
  const confirmText="Send en ekte e-post med samlet betalingsoversikt for faktura "+
   invoice.invoice_number+" til "+email+"?\n"+
   "Netto innbetalt: "+money(amounts.paid)+"\n"+
   "Kreditert: "+money(amounts.credited)+"\n"+
   (amounts.outstanding>0?"Gjenstående krav: "+money(amounts.outstanding)+"\n":"Fakturaen er oppgjort.\n")+
   "Denne e-posten inneholder PDF-vedlegg, men oppretter ikke en ny faktura eller betaling.";
  if(!window.confirm(confirmText))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/admin/invoices/payment-statements",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     action:"send",invoiceId:id,confirmed:true,expectedEmail:email,
     expectedPaidOre:amounts.paid,expectedCreditedOre:amounts.credited,
     expectedOutstandingOre:amounts.outstanding
    })
   });
   const data=await r.json();if(!r.ok)throw Error(data.error||"Betalingsoversikten kunne ikke sendes.");
   setNotice(data.alreadySent?"Denne betalingsoversikten er allerede sendt. Ingen ny e-post ble sendt.":
    "Samlet betalingsoversikt er sendt til "+data.to+".");
   const h=await fetch(base+"&mode=history",{cache:"no-store"});
   const history=await h.json();if(h.ok)setRecords(history.statements||[]);
  }catch(e){setError((e.message||"Utsendingen kunne ikke bekreftes.")+
   " Kontroller sendeloggen før du prøver igjen.");}
  finally{setBusy(false);}
 }
 if(invoice.status==="draft")return null;
 return <section id="invoice-payment-statement" style={{padding:"16px 0",borderBottom:"1px solid #d8c9ae",marginBottom:18}}>
  <h2>Samlet betalingsoversikt</h2>
  <p style={{fontSize:13}}>Én PDF med alle registrerte innbetalinger, kreditnotaer og eventuelle Vipps-refusjoner, samt oppdatert saldo. Oversikten er ikke en ny faktura.</p>
  {blocked&&<p role="alert" style={{padding:10,background:"#fff4e6",borderRadius:8}}>
   Betalingshistorikken må kontrolleres før en ny oversikt kan sendes. {settlement.guidance}
  </p>}
  {!loading&&hasActivity&&<div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
   <a href={base} target="_blank" rel="noreferrer">Åpne oppdatert betalingsoversikt (PDF)</a>
   {canSend&&<button type="button" onClick={send} disabled={busy||blocked}>
    {busy?"Sender …":"Send samlet oversikt på e-post"}
   </button>}
  </div>}
  {loading&&<p>Henter tidligere betalingsoversikter …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {notice&&<p role="status" style={{fontWeight:700}}>{notice}</p>}
  {!loading&&records.length>0&&<>
   <h3 style={{marginTop:16}}>Tidligere opprettede oversikter</h3>
   {records.map(row=><div key={row.id} style={{padding:"8px 0",borderBottom:"1px solid #e5dfd4"}}>
    <strong>{row.asOfDate||"Oversiktsdato ikke oppgitt"}</strong> · Netto innbetalt {money(row.paidOre)}
    {Number(row.outstandingOre)>0&&<> · Gjenstår {money(row.outstandingOre)}</>}
    <div style={{fontSize:12}}>{row.sent_at?"Sendt på e-post":"Ikke bekreftet sendt"}</div>
    <a target="_blank" rel="noreferrer" href={base+"&documentId="+encodeURIComponent(row.id)}>
     Åpne lagret PDF
    </a>
    {row.delivery_error&&!row.sent_at&&<p style={{fontSize:12}}>{row.delivery_error}</p>}
   </div>)}
  </>}
  {!loading&&!hasActivity&&<p>Det er foreløpig ingen registrerte innbetalinger eller kreditnotaer å samle i en betalingsoversikt.</p>}
  <button type="button" disabled={loading||busy} style={{marginTop:12}}
   onClick={()=>setRetry(n=>n+1)}>Oppdater oversikter</button>
 </section>;
}
