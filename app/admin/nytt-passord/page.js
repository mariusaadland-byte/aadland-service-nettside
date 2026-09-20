"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@supabase/supabase-js";

export default function NewPassword(){
 const router=useRouter(),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
 const [supabase]=useState(()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
 useEffect(()=>{const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));const access=hash.get("access_token"),refresh=hash.get("refresh_token");if(access&&refresh){supabase.auth.setSession({access_token:access,refresh_token:refresh}).then(({error})=>{if(error)setError("Lenken er ugyldig eller utløpt.");else setReady(true)})}else{supabase.auth.getSession().then(({data})=>{if(data.session)setReady(true);else setError("Lenken er ugyldig eller utløpt.")})}},[supabase]);
 async function save(e){e.preventDefault();setError("");if(password.length<8){setError("Passordet må være minst 8 tegn.");return}if(password!==confirm){setError("Passordene er ikke like.");return}setSaving(true);const {error}=await supabase.auth.updateUser({password});setSaving(false);if(error){setError("Kunne ikke lagre nytt passord. Be om en ny lenke.");return}router.replace("/admin/login");}
 return <main className="login"><form className="loginbox" onSubmit={save}><div className="mark">AS</div><h1>Nytt passord</h1><p className="muted">Aadland Service</p>{error&&<p className="notice">{error}</p>}{ready&&<><div className="field"><label>Nytt passord</label><input type="password" autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div><div className="field"><label>Gjenta passord</label><input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div><button className="btn" style={{width:"100%",marginTop:14}} disabled={saving}>{saving?"Lagrer …":"Lagre nytt passord"}</button></>}</form></main>;
}
