"use client";

import {useState} from "react";
import Link from "next/link";

export default function TestReceiptClient(){
 const [email,setEmail]=useState("");
 const [customerName,setCustomerName]=useState("Testkunde");
 const [reference,setReference]=useState("TEST-VIPPS-12345");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 async function send(e){
  e.preventDefault();
  setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/test-receipt",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,customerName,reference})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Testkvitteringen kunne ikke sendes.");
   setMessage("Testkvitteringen er sendt til "+(data.sentTo||email)+".");
  }catch(err){
   setError(err.message||"Testkvitteringen kunne ikke sendes.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="admin">
  <section className="adminmain" style={{marginLeft:0,maxWidth:760}}>
   <Link href="/admin">← Tilbake til backoffice</Link>
   <div className="kicker" style={{marginTop:28}}>PREVIEW / TEST</div>
   <h1>Test betalingsbekreftelse</h1>
   <div className="card">
    <p><b>Denne testen endrer ingen bestilling og registrerer ingen betaling.</b></p>
    <p className="muted">Du får en eksempelkvittering på 8 500 kr. E-posten er merket TEST, men bruker samme visuelle kvitteringsoppsett som betalingsbekreftelsen.</p>
    <form onSubmit={send}>
     <div className="field"><label>Send test til e-post</label><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="din@epost.no"/></div>
     <div className="field"><label>Kundenavn i testen</label><input maxLength={120} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></div>
     <div className="field"><label>Betalingsreferanse</label><input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></div>
     {error&&<p className="notice">{error}</p>}
     {message&&<p className="success">{message}</p>}
     <button className="btn" disabled={busy}>{busy?"Sender …":"Send test-kvittering"}</button>
    </form>
   </div>
  </section>
 </main>;
}
