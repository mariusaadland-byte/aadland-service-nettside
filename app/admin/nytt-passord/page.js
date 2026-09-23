"use client";
import {useSearchParams} from "next/navigation";
import {useState} from "react";

export default function NewPassword(){
 const params=useSearchParams();
 const token=String(params.get("token")||"");
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [error,setError]=useState(token?"":"Lenken mangler eller er ugyldig. Be om en ny lenke.");
 const [saving,setSaving]=useState(false);
 const [done,setDone]=useState(false);

 async function save(e){
  e.preventDefault();
  setError("");
  if(!token){setError("Lenken mangler eller er ugyldig. Be om en ny lenke.");return}
  if(password.length<8||password.length>128){setError("Passordet må være mellom 8 og 128 tegn.");return}
  if(password!==confirm){setError("Passordene er ikke like.");return}
  setSaving(true);
  try{
   const r=await fetch("/api/auth/update-password",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token,password})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Kunne ikke lagre nytt passord.");return}
   setDone(true);
   setPassword("");
   setConfirm("");
  }catch{
   setError("Kunne ikke lagre nytt passord. Be om en ny lenke.");
  }finally{
   setSaving(false);
  }
 }

 return <main className="login">
  <form className="loginbox" onSubmit={save}>
   <div className="mark">AS</div>
   <h1>Nytt passord</h1>
   <p className="muted">Aadland Service backoffice</p>

   {error&&<p className="notice">{error}</p>}
   {done?<div className="success adminPasswordDone">
    <b>Passordet er endret.</b>
    <p>Du kan nå logge inn med det nye passordet.</p>
    <a className="btn" href="/admin/login">Til innlogging</a>
   </div>:token&&<>
    <div className="field">
     <label>Nytt passord</label>
     <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={saving} value={password} onChange={e=>setPassword(e.target.value)}/>
    </div>
    <div className="field">
     <label>Gjenta passord</label>
     <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={saving} value={confirm} onChange={e=>setConfirm(e.target.value)}/>
    </div>
    <button className="btn" style={{width:"100%",marginTop:14}} disabled={saving}>{saving?"Lagrer …":"Lagre nytt passord"}</button>
   </>}
  </form>
 </main>;
}
