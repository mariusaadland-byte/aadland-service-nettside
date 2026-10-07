"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
const date=value=>value?new Date(value+"T12:00:00").toLocaleDateString("nb-NO"):"—";
const dateTime=value=>value?new Date(value).toLocaleString("nb-NO"):"—";
function futureDate(days){
 const d=new Date();
 d.setDate(d.getDate()+days);
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return y+"-"+m+"-"+day;
}

export default function PaymentReminderClient(){
 const [invoiceNumber,setInvoiceNumber]=useState("");
 const [customerName,setCustomerName]=useState("");
 const [customerEmail,setCustomerEmail]=useState("");
 const [amount,setAmount]=useState("");
 const [originalDueDate,setOriginalDueDate]=useState("");
 const [reminderDueDate,setReminderDueDate]=useState(()=>futureDate(14));
 const [extraNote,setExtraNote]=useState("");
 const [invoicePdf,setInvoicePdf]=useState(null);
 const [history,setHistory]=useState([]);
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [setupRequired,setSetupRequired]=useState(false);

 async function load(){
  setLoading(true);
  try{
   const r=await fetch("/api/admin/payment-reminders");
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Purringene kunne ikke hentes.");return}
   setHistory(d.reminders||[]);
   setSetupRequired(d.setupRequired===true);
  }finally{setLoading(false)}
 }
 useEffect(()=>{load()},[]);

 const amountOre=useMemo(()=>{
  const n=Number(String(amount||"").replace(",","."));
  return Number.isFinite(n)?Math.round(n*100):0;
 },[amount]);

 const preview=useMemo(()=>[
  customerName?"Hei "+customerName+",":"Hei,",
  "",
  "Vi viser til faktura "+(invoiceNumber||"[fakturanummer]")+" på "+(amountOre>0?kr(amountOre):"[beløp]")+(originalDueDate?", med opprinnelig forfall "+date(originalDueDate):"")+".",
  "Vi kan ikke se at betaling er registrert.",
  "",
  "Ny betalingsfrist: "+(reminderDueDate?date(reminderDueDate):"[dato]")+".",
  "",
  "Kopi av original faktura er vedlagt.",
  extraNote||"",
  "",
  "Dersom fakturaen allerede er betalt, kan du se bort fra denne meldingen.",
  "",
  "Vennlig hilsen",
  "Aadland Service"
 ].filter((line,index,array)=>line!==""||array[index-1]!=="").join("\n"),[customerName,invoiceNumber,amountOre,originalDueDate,reminderDueDate,extraNote]);

 async function send(event){
  event.preventDefault();
  setError("");setMessage("");
  if(!invoicePdf){setError("Legg ved original faktura som PDF.");return}
  if(!window.confirm("Sende betalingspåminnelsen til "+customerEmail+" med original faktura vedlagt?"))return;

  const form=new FormData();
  form.set("invoiceNumber",invoiceNumber);
  form.set("customerName",customerName);
  form.set("customerEmail",customerEmail);
  form.set("amount",amount);
  form.set("originalDueDate",originalDueDate);
  form.set("reminderDueDate",reminderDueDate);
  form.set("extraNote",extraNote);
  form.set("invoicePdf",invoicePdf);

  setSending(true);
  const r=await fetch("/api/admin/payment-reminders",{method:"POST",body:form});
  const d=await r.json().catch(()=>({}));
  setSending(false);
  if(!r.ok){
   setError(d.error||"Purringen kunne ikke sendes.");
   if(d.statusSaved)await load();
   return;
  }
  setMessage("Purring nr. "+d.reminder.reminderNumber+" er sendt til "+customerEmail+".");
  setInvoiceNumber("");
  setCustomerName("");
  setCustomerEmail("");
  setAmount("");
  setOriginalDueDate("");
  setReminderDueDate(futureDate(14));
  setExtraNote("");
  setInvoicePdf(null);
  const input=document.getElementById("payment-reminder-pdf");
  if(input)input.value="";
  await load();
 }

 return <main className="admin">
  <div className="adminPageTop">
   <div>
    <div className="kicker">AADLAND SERVICE</div>
    <h1>Purring</h1>
    <p className="muted">Send en profesjonell betalingspåminnelse med kopi av original faktura. Purringsnummer tildeles automatisk fra 1013.</p>
   </div>
   <Link className="btn alt" href="/admin">← Backoffice</Link>
  </div>

  {error&&<p className="notice">{error}</p>}
  {message&&<p className="notice">{message}</p>}
  {setupRequired&&<div className="adminProjectMigrationWarning"><b>Databaseoppdatering mangler</b><span>Purringshistorikken må aktiveres før funksjonen kan brukes.</span><code>supabase/migrations/20260930235535_payment_reminders.sql</code></div>}

  <div className="grid" style={{alignItems:"start"}}>
   <form className="card" onSubmit={send}>
    <div className="kicker">NY BETALINGSPÅMINNELSE</div>
    <h3>Faktura og kunde</h3>

    <div className="field"><label>Fakturanummer *</label><input required maxLength={120} value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="F.eks. 1048"/></div>
    <div className="field"><label>Kundenavn *</label><input required maxLength={160} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></div>
    <div className="field"><label>Kundens e-post *</label><input required type="email" maxLength={254} value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)}/></div>
    <div className="field"><label>Utestående beløp (kr) *</label><input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="8500"/></div>
    <div className="field"><label>Opprinnelig forfallsdato</label><input type="date" value={originalDueDate} onChange={e=>setOriginalDueDate(e.target.value)}/></div>
    <div className="field"><label>Ny betalingsfrist *</label><input required type="date" value={reminderDueDate} onChange={e=>setReminderDueDate(e.target.value)}/><small className="muted">Standard er 14 dager frem. Du kan endre datoen.</small></div>
    <div className="field"><label>Ekstra melding <span className="muted">(valgfritt)</span></label><textarea rows="3" maxLength={2000} value={extraNote} onChange={e=>setExtraNote(e.target.value)} placeholder="F.eks. Ta gjerne kontakt dersom noe er uklart."/></div>
    <div className="field"><label>Kopi av original faktura (PDF) *</label><input id="payment-reminder-pdf" required type="file" accept="application/pdf,.pdf" onChange={e=>setInvoicePdf(e.target.files?.[0]||null)}/><small className="muted">Maks 10 MB. PDF-en sendes som vedlegg og lagres ikke i backoffice.</small></div>

    <div className="notice" style={{marginTop:16}}>
     <b>Ingen automatisk purregebyr</b><br/>
     <span>Denne funksjonen sender en vanlig betalingspåminnelse. Den legger ikke automatisk til gebyr eller inkassovarsel.</span>
    </div>

    <button className="btn" type="submit" disabled={sending||setupRequired}>{sending?"Sender …":"Send purring med faktura"}</button>
   </form>

   <section className="card">
    <div className="kicker">FORHÅNDSVISNING</div>
    <h3>E-posttekst</h3>
    <p><b>Emne:</b> Betalingspåminnelse – faktura {invoiceNumber||"[fakturanummer]"}</p>
    <div style={{whiteSpace:"pre-wrap",lineHeight:1.65}}>{preview}</div>
    <hr style={{margin:"22px 0",opacity:.2}}/>
    <p className="muted">E-posten får Aadland Service-design, purringsnummer, beløp, frister og vedlagt original faktura.</p>
   </section>
  </div>

  <section className="card" style={{marginTop:24}}>
   <div className="kicker">HISTORIKK</div>
   <h3>Sendte purringer</h3>
   {loading?<p className="muted">Laster …</p>:history.length===0?<p className="muted">Ingen purringer sendt ennå.</p>:<div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
     <thead><tr><th style={{textAlign:"left"}}>Nr.</th><th style={{textAlign:"left"}}>Faktura</th><th style={{textAlign:"left"}}>Kunde</th><th style={{textAlign:"right"}}>Beløp</th><th style={{textAlign:"left"}}>Status</th><th style={{textAlign:"left"}}>Sendt</th></tr></thead>
     <tbody>{history.map(row=><tr key={row.id}>
      <td><b>{row.reminderNumber}</b></td>
      <td>{row.invoiceNumber}</td>
      <td>{row.customerName}<br/><small className="muted">{row.customerEmail}</small></td>
      <td style={{textAlign:"right"}}>{kr(row.amountOre)}</td>
      <td>{row.status==="sent"?"Sendt":row.status==="failed"?"Feilet":"Kladd"}{row.errorMessage&&<><br/><small className="muted">{row.errorMessage}</small></>}</td>
      <td>{row.sentAt?dateTime(row.sentAt):dateTime(row.createdAt)}</td>
     </tr>)}</tbody>
    </table>
   </div>}
  </section>
 </main>;
}
