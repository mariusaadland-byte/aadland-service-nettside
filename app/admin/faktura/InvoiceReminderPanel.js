"use client";
import {useEffect,useRef,useState} from "react";
import {invoicePaymentState} from "../../../lib/invoicePaymentStatus";
import {invoiceSettlementInfo} from "../../../lib/invoiceSettlementInfo";
import {osloDateKey} from "../../../lib/osloTime";
import {nextInvoiceReminder,reminderDateAfter,reminderText} from "../../../lib/invoiceReminders";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
const date=value=>value?new Date(value.length===10?value+"T12:00:00":value).toLocaleString("nb-NO",{timeZone:"Europe/Oslo",...(value.length===10?{year:"numeric",month:"2-digit",day:"2-digit"}:{dateStyle:"short",timeStyle:"short"})}):"";
export default function InvoiceReminderPanel({invoice,disabled=false,onRefresh}){
 const [records,setRecords]=useState([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[historyLoaded,setHistoryLoaded]=useState(false),[historyRetry,setHistoryRetry]=useState(0),[sending,setSending]=useState(false);
 const [dueDate,setDueDate]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[refundedRestReviewed,setRefundedRestReviewed]=useState(false);
 const request=useRef(null),sendingRef=useRef(false);
 const today=osloDateKey(new Date()),payment=invoicePaymentState(invoice,today),next=nextInvoiceReminder(records,today);
 const pending=next.pending,kind=next.kind||"inkasso",name=kind==="inkasso"?"Inkassovarsel":"Purring";
 const settlement=invoiceSettlementInfo(invoice,today);
 const reviewRequired=settlement.kind==="refundedOutstanding";
 const blockFollowup=settlement.kind==="activeVipps"||settlement.kind==="mismatch";
 const eligible=historyLoaded&&!loading&&["issued","sent"].includes(invoice.status)&&payment.outstanding>0&&invoice.due_date<today&&!next.done&&(!next.waitUntil||next.waitUntil<today)&&!blockFollowup;
 const preview=pending?{subject:pending.subject,body:pending.body}:reminderText(invoice,kind,dueDate||next.dueDate,payment.outstanding);
 useEffect(()=>{
  let ignore=false;setLoading(true);setHistoryLoaded(false);setRecords([]);setOpen(false);setRefundedRestReviewed(false);request.current=null;setError("");
  fetch("/api/admin/invoices/reminders?invoiceId="+encodeURIComponent(invoice.id)).then(async r=>{
   const data=await r.json();if(!r.ok)throw Error(data.error);
   if(!ignore){setRecords(data.reminders||[]);setHistoryLoaded(true);setLoading(false);}
  }).catch(e=>{if(!ignore){setError(e.message);setLoading(false)}});
  return ()=>{ignore=true};
 },[invoice.id,invoice.payment_updated_at,invoice.credited_ore,historyRetry]);
 async function refreshHistory(){
  const r=await fetch("/api/admin/invoices/reminders?invoiceId="+encodeURIComponent(invoice.id));const data=await r.json();
  if(!r.ok)throw Error(data.error);setRecords(data.reminders||[]);setHistoryLoaded(true);
 }
 function editReminder(){
  request.current=pending?.id||crypto.randomUUID();setDueDate(next.dueDate);setRefundedRestReviewed(false);
  setOpen(true);setNotice("");setError("");
 }
 async function send(){
  if(sendingRef.current||!eligible||!request.current||(reviewRequired&&!refundedRestReviewed))return;
  const recipient=pending?.recipient||invoice.customer?.email||"";
  if(!window.confirm("Sende "+name.toLowerCase()+" til "+recipient+"?\n\nRestbeløp: "+money(payment.outstanding)+"\nNy betalingsfrist: "+date(dueDate)+"\n\nDette sender en ekte e-post med PDF-vedlegg. Kontroller at betalingen ikke allerede er mottatt."))return;
  sendingRef.current=true;setSending(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/invoices/reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invoiceId:invoice.id,requestId:request.current,kind,dueDate,outstandingOre:payment.outstanding,reviewedRefundRest:reviewRequired&&refundedRestReviewed})});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   setOpen(false);setNotice(name+" er sendt til "+invoice.customer.email+".");
   await refreshHistory();if(onRefresh)await onRefresh();
  }catch(e){
   setError(e.message||"Utsendingen kunne ikke bekreftes.");
   try{await refreshHistory()}catch{}
  }finally{sendingRef.current=false;setSending(false)}
 }
 return <section style={{padding:"16px 0",borderBottom:"1px solid #d8c9ae",marginBottom:18}}>
  <h2>Purring og inkassovarsel</h2>
  {settlement.needsReview&&<p role="status" style={{padding:12,background:"#fff4e6",border:"1px solid #dec08d",borderRadius:8}}>
   <strong>Kontroll før purring:</strong> {settlement.guidance}
   {blockFollowup&&" Sending er sperret inntil denne situasjonen er avklart."}
  </p>}
  {payment.outstanding>0&&<><p>Gjenstående: <strong>{money(payment.outstanding)}</strong>. Standardtekst, egen PDF og originalfaktura følger e-posten.</p>
   {invoice.due_date>=today&&<p>Purring blir tilgjengelig etter fakturaens forfallsdato.</p>}
   {next.waitUntil&&next.waitUntil>=today&&<p>Fristen i purringen er {date(next.waitUntil)}. Inkassovarsel blir tilgjengelig etter denne datoen.</p>}
   {next.done?<p>Inkassovarsel er sendt med frist {date(next.dueDate)}. Eventuell oversendelse til inkassobyrå håndteres manuelt når fristen er utløpt. Et omtvistet krav må avklares før videre innkreving.</p>:<button type="button" disabled={disabled||loading||sending||!eligible||!invoice.customer?.email} onClick={editReminder}>{pending?"Åpne forrige sendeforsøk":"Send "+name.toLowerCase()}</button>}
   {!invoice.customer?.email&&<p>Kunden mangler e-postadresse.</p>}
  </>}
  {!loading&&!historyLoaded&&<button type="button" disabled={disabled||sending} onClick={()=>setHistoryRetry(n=>n+1)}>Prøv å hente purringshistorikken igjen</button>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {open&&<div style={{padding:16,marginTop:16,border:"1px solid #d8c9ae",borderRadius:12}}>
   <h3>Kontroller {name.toLowerCase()} før sending</h3>
   <p>Til: <strong>{pending?.recipient||invoice.customer.email}</strong><br/>Vedlegg: {name} og original faktura {invoice.invoice_number}</p>
   {pending&&<p>Dette er et tidligere sendeforsøk. Samme mottaker, frist, tekst og vedlegg brukes ved nytt forsøk.</p>}
   <label>Ny betalingsfrist<input type="date" min={reminderDateAfter(today)} value={dueDate} disabled={sending||disabled||Boolean(pending)} onChange={e=>setDueDate(e.target.value)}/></label>
   <p><strong>{preview.subject}</strong></p>
   <div style={{whiteSpace:"pre-wrap",lineHeight:1.6,padding:14,background:"#f5f1e8",color:"#201d18",borderRadius:8}}>{preview.body}</div>
   <p>Fristen er minst 14 dager fra sending. Gebyr og renter legges ikke til.</p>
   {reviewRequired&&<label style={{display:"block",padding:12,border:"1px solid #d6b579",borderRadius:8,margin:"10px 0"}}>
    <input type="checkbox" checked={refundedRestReviewed} onChange={e=>setRefundedRestReviewed(e.target.checked)}/>
    Jeg har kontrollert den registrerte Vipps-refusjonen og bekrefter at restbeløpet fortsatt er et reelt krav mot kunden.
   </label>}
   {eligible&&(pending||dueDate>=reminderDateAfter(today))&&<p><a href={"/api/admin/invoices/reminders/preview?invoiceId="+encodeURIComponent(invoice.id)+"&kind="+encodeURIComponent(kind)+"&dueDate="+encodeURIComponent(pending?.due_date||dueDate)} target="_blank" rel="noreferrer">Forhåndsvis "+name.toLowerCase()+" som PDF (uten sending)</a></p>}
   <button type="button" disabled={sending||disabled||!eligible||(reviewRequired&&!refundedRestReviewed)||(!pending&&dueDate<reminderDateAfter(today))} onClick={send}>{sending?"Sender …":pending?"Prøv samme utsending igjen":"Send "+name.toLowerCase()+" på e-post"}</button>{" "}
   <button type="button" disabled={sending} onClick={()=>setOpen(false)}>Avbryt</button>
  </div>}
  <h3>Historikk</h3>
  {loading?<p>Henter historikk …</p>:records.length===0?<p>Ingen purringer eller inkassovarsler sendt.</p>:records.map(record=><details key={record.id} style={{padding:"10px 0",borderBottom:"1px solid #ddd"}}>
   <summary>{record.kind==="inkasso"?"Inkassovarsel":"Purring"} · {record.status==="sent"?"Sendt "+date(record.sent_at):"Sending ikke bekreftet – "+date(record.created_at)}</summary>
   <p>Til: {record.recipient}<br/>Restbeløp: {money(Number(record.outstanding_ore))}<br/>Betalingsfrist: {date(record.due_date)}<br/>{record.subject}</p>
   <p style={{whiteSpace:"pre-wrap"}}>{record.body}</p>{record.error_message&&<p>{record.error_message}</p>}
   {record.hasPdf&&<a href={"/api/admin/invoices/reminders?invoiceId="+encodeURIComponent(invoice.id)+"&documentId="+encodeURIComponent(record.id)} target="_blank" rel="noreferrer">Åpne {record.kind==="inkasso"?"inkassovarsel":"purring"} som PDF</a>}
  </details>)}
 </section>;
}
