"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";

export default function NewPassword(){
 const router=useRouter(),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
  const accessToken=hash.get("access_token");
  if(!accessToken){setError("Lenken er ugyldig eller utløpt.");return}
  sessionStorage.setItem("aadland-reset-token",accessToken);
  setReady(true);
 },[]);
 async function save(e){
  e.preventDefault();setError("");
  if(password.length<8){setError("Passordet må være minst 8 tegn.");return}
  if(password!==confirm){setError("Passordene er ikke like.");return}
  setSaving(true);
  try{
   const token=sessionStorage.getItem("aadland-reset-token");
   const r=await fetch("/api/auth/update-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,password})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Kunne ikke lagre nytt passord. Be om en ny lenke.");return}
   sessionStorage.removeItem("aadland-reset-token");
   router.replace("/admin/login");
  }catch{setError("Kunne ikke lagre nytt passord. Be om en ny lenke.")}
  finally{setSaving(false)}
 }
 return <main className="login"><form className="loginbox" onSubmit={save}><div className="mark">AS</div><h1>Nytt passord</h1><p className="muted">Aadland Service</p>{error&&<p className="notice">{error}</p>}{ready&&<><div className="field"><label>Nytt passord</label><input type="password" autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div><div className="field"><label>Gjenta passord</label><input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div><button className="btn" style={{width:"100%",marginTop:14}} disabled={saving}>{saving?"Lagrer …":"Lagre nytt passord"}</button></>}</form></main>;
}
