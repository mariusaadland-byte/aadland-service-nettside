"use client";
import {useEffect,useState} from "react";
export default function InvoicePaymentResult(){
 const [status,setStatus]=useState("pending"),[error,setError]=useState(""),[receipt,setReceipt]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let stopped=false,timer,attempts=0;
  const reference=new URLSearchParams(window.location.search).get("reference");
  async function check(){
   try{
    const r=await fetch("/api/invoice-vipps-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference})});
    const d=await r.json();if(stopped)return;if(!r.ok)throw Error(d.error);
    setStatus(d.status);setReceipt(d.receiptSent);setError("");
    if(["paid","cancelled","refunded"].includes(d.status))return;
   }catch(e){if(stopped)return;setError(e.message||"Status kunne ikke hentes.");}
   if(++attempts<20)timer=setTimeout(check,5000);
  }
  check();return ()=>{stopped=true;clearTimeout(timer)};
 },[retry]);
 return <main className="container" style={{maxWidth:650,padding:"48px 20px"}}><h1>{status==="paid"?"Takk for betalingen!":status==="cancelled"?"Betalingen ble ikke fullført":status==="refunded"?"Betalingen er refundert":"Vi kontrollerer betalingen"}</h1><p>{status==="paid"?(receipt?"Fakturaen er registrert som betalt. Kvittering er sendt på e-post.":"Fakturaen er registrert som betalt. Kvitteringen sendes på e-post."):status==="cancelled"?"Kontakt Aadland Service for en ny betalingslenke.":"Du får bekreftelse her når betalingen er kontrollert hos Vipps."}</p>{error&&<p role="status">{error}</p>}{status!=="paid"&&<button onClick={()=>setRetry(x=>x+1)}>Kontroller status igjen</button>}<p><a href="/">Til Aadland Service</a></p></main>;
}
