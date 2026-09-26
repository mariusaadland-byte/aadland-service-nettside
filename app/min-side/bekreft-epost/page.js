"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

export default function BekreftEpost(){
 const [token,setToken]=useState("");
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [state,setState]=useState("idle");
 const [message,setMessage]=useState("");

 useEffect(()=>{
  const value=new URLSearchParams(window.location.search).get("token")||"";
  setToken(value);
  if(value)window.history.replaceState({},document.title,window.location.pathname);
  setReady(true);
 },[]);

 async function confirm(){
  if(!token){
   setState("error");
   setMessage("Bekreftelseslenken mangler eller er ugyldig.");
   return;
  }
  setBusy(true);
  setState("idle");
  setMessage("");
  try{
   const r=await fetch("/api/customer/verify",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
    setState(d.code==="already_verified"?"already":"error");
    setMessage(d.error||"E-postadressen kunne ikke bekreftes.");
    return;
   }
   setState("success");
   setMessage("E-postadressen er bekreftet. Du sendes videre til Min side.");
   window.setTimeout(()=>window.location.assign("/min-side?verification=success"),700);
  }catch{
   setState("error");
   setMessage("E-postadressen kunne ikke bekreftes akkurat nå. Prøv igjen.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="customerPage customerLoginPage">
  <Link href="/min-side">← Min side</Link>
  <div className="kicker customerTopKicker">MIN SIDE</div>
  <h1>Bekreft e-post</h1>
  <p>For å aktivere kundekontoen må du bekrefte at e-postadressen tilhører deg.</p>

  <section className="card customerLoginCard">
   {!ready&&<p>Laster bekreftelsen …</p>}
   {ready&&!token&&<p className="notice">Bekreftelseslenken mangler eller er ugyldig.</p>}
   {ready&&token&&state!=="success"&&<>
    <p>Trykk på knappen under for å bekrefte e-postadressen og aktivere Min side.</p>
    {(state==="error"||state==="already")&&<p className="notice">{message}</p>}
    {state!=="already"&&<button type="button" className="btn" disabled={busy} onClick={confirm}>
     {busy?"Bekrefter …":"Bekreft e-post"}
    </button>}
   </>}
   {state==="success"&&<p className="success">{message}</p>}
   {state==="error"&&<p style={{marginTop:14,fontSize:14}}><Link href="/min-side">Gå til Min side</Link> og velg «Send bekreftelsesmail på nytt» hvis lenken har utløpt.</p>}
   {state==="already"&&<p style={{marginTop:14,fontSize:14}}><Link href="/min-side">Gå til Min side og logg inn →</Link></p>}
  </section>

  <p style={{marginTop:18,color:"#71675d",fontSize:14}}>
   Kontoen blir ikke aktivert bare ved å åpne lenken i e-posten. Du må trykke «Bekreft e-post» på denne siden.
  </p>
 </main>;
}
