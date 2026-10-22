"use client";
import {useEffect,useState} from "react";

const terminalWithReceipt=(status,receipt)=>status==="cancelled"||status==="refunded"||(status==="paid"&&receipt);
export default function InvoicePaymentResult(){
 const [status,setStatus]=useState("pending");
 const [error,setError]=useState("");
 const [receipt,setReceipt]=useState(false);
 const [retry,setRetry]=useState(0);
 const [checking,setChecking]=useState(true);
 useEffect(()=>{
  let stopped=false,timer,attempts=0;
  const reference=new URLSearchParams(window.location.search).get("reference");
  async function check(){
   if(!reference){
    setChecking(false);setError("Betalingsreferansen mangler. Bruk lenken du fikk fra Aadland Service.");return;
   }
   try{
    const r=await fetch("/api/invoice-vipps-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference}),cache:"no-store"});
    const d=await r.json();if(stopped)return;
    if(!r.ok)throw Error(d.error||"Status kunne ikke hentes.");
    setStatus(d.status);setReceipt(Boolean(d.receiptSent));setError("");
    // A successful payment can be registered before the receipt email is confirmed.
    // Keep checking that receipt separately, without suggesting the user pay again.
    if(terminalWithReceipt(d.status,Boolean(d.receiptSent))){setChecking(false);return;}
   }catch(e){if(stopped)return;setError(e.message||"Status kunne ikke hentes.");}
   if(++attempts<20)timer=setTimeout(check,5000);
   else setChecking(false);
  }
  setChecking(true);check();
  return ()=>{stopped=true;clearTimeout(timer)};
 },[retry]);
 const paid=status==="paid",refunded=status==="refunded",cancelled=status==="cancelled",partial=status==="partial";
 const title=paid?"Takk for betalingen!":refunded?"Betalingen er refundert":cancelled?"Betalingen ble ikke fullført":partial?"Delbetaling registrert":"Vi kontrollerer betalingen";
 const message=paid?(receipt?"Vipps-betalingen er registrert. Kvittering for betalingen er sendt på e-post. Du får informasjon om eventuelt restbeløp fra Aadland Service.":"Vipps-betalingen er registrert. Vi kontrollerer at kvitteringen er sendt til e-posten din. Du skal ikke betale denne betalingsforespørselen på nytt.")
  :refunded?"Betalingen er refundert. Kontakt Aadland Service ved spørsmål."
  :cancelled?"Kontakt Aadland Service for en ny betalingslenke."
  :partial?"Vi har registrert en delbetaling. Aadland Service kan hjelpe deg med eventuelt restbeløp."
  :"Du får bekreftelse her når betalingen er kontrollert hos Vipps.";
 return <main className="container" style={{maxWidth:650,padding:"48px 20px"}}>
  <h1>{title}</h1><p>{message}</p>
  {checking&&<p role="status">{paid&&!receipt?"Kontrollerer kvitteringen …":"Kontrollerer betalingsstatus …"}</p>}
  {error&&<p role="status">{error}</p>}
  {!checking&&paid&&!receipt&&<p>Kvitteringen er ikke bekreftet sendt ennå. Vipps-betalingen er registrert, så ikke betal denne betalingsforespørselen på nytt. Du kan kontrollere kvitteringsstatus igjen eller kontakte Aadland Service.</p>}
  {!checking&&!terminalWithReceipt(status,receipt)&&<button type="button" onClick={()=>{setError("");setRetry(n=>n+1)}}>Kontroller status igjen</button>}
  <p><a href="/">Til Aadland Service</a></p>
 </main>;
}
