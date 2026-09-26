"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

export default function NyttPassord(){
 const [token,setToken]=useState("");
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  const value=new URLSearchParams(window.location.search).get("token")||"";
  setToken(value);
  if(value)window.history.replaceState({},document.title,window.location.pathname);
  setReady(true);
 },[]);

 async function go(e){
  e.preventDefault();
  setError("");
  setMessage("");

  if(!token)return setError("Lenken er ugyldig eller utløpt. Be om en ny lenke fra Min side.");
  if(password.length<8||password.length>128)return setError("Passordet må være mellom 8 og 128 tegn.");
  if(password!==confirm)return setError("Passordene er ikke like.");

  setBusy(true);
  try{
   const r=await fetch("/api/customer/update-password",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token,password})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
    setError(d.error||"Passordet kunne ikke endres. Be om en ny lenke fra Min side.");
    return;
   }
   setMessage("Passordet er endret. Du kan nå logge inn på Min side.");
   setPassword("");
   setConfirm("");
   setToken("");
   window.history.replaceState({},document.title,window.location.pathname);
  }catch{
   setError("Passordet kunne ikke endres akkurat nå. Prøv igjen.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="customerPage customerLoginPage">
  <Link href="/min-side">← Min side</Link>
  <div className="kicker customerTopKicker">MIN SIDE</div>
  <h1>Nytt passord</h1>
  <p>Velg et nytt passord til kundekontoen din.</p>

  <form className="card customerLoginCard" onSubmit={go}>
   {!ready&&<p>Laster lenken …</p>}
   {ready&&!token&&!message&&<p className="notice">Lenken er ugyldig eller utløpt. Be om en ny lenke fra Min side.</p>}
   {token&&<>
    <div className="field">
     <label>Nytt passord</label>
     <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/>
    </div>
    <div className="field" style={{marginTop:12}}>
     <label>Gjenta passord</label>
     <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)}/>
    </div>
   </>}
   {error&&<p className="notice">{error}</p>}
   {message&&<p className="success">{message}</p>}
   {token&&<button className="btn" disabled={busy} style={{width:"100%",marginTop:14}}>{busy?"Lagrer …":"Lagre nytt passord"}</button>}
   {message&&<Link href="/min-side" className="btn" style={{display:"block",textAlign:"center",marginTop:10}}>Logg inn på Min side</Link>}
  </form>
 </main>;
}
