"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {rentalManualInput,rentalManualUrl} from "../../../../../lib/rentalManuals.mjs";
import styles from "../../eget-bruk/ownUse.module.css";
export default function ManualEditor({id,version,enabled,publicEnabled}){
 const [v,setV]=useState({manufacturer:version?.manufacturer||"",model:version?.model||"",url:version?.manual_url||"",language:version?.language||"",safetyNote:version?.safety_note||"",published:false,verified:false});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),lock=useRef(false),request=useRef(null),router=useRouter();
 const edit=(k,value)=>{request.current=null;setV(x=>({...x,[k]:value,...(k==="verified"?{}:{verified:false})}));};
 async function save(e){e.preventDefault();if(lock.current||!enabled)return;
 if(!request.current)request.current=crypto.randomUUID();
 const body={...v,itemId:id,requestId:request.current,expectedVersion:version?.id||null};
 if(!rentalManualInput(body)){setError("Kontroller alle felter og bekreft riktig produsentdokument.");return;}
 if(!window.confirm(v.published?"Publisere ny kontrollert dokumentversjon?":"Lagre ny upublisert versjon? En tidligere offentlig versjon vil ikke lenger vises."))return;
 lock.current=true;setBusy(true);setError("");
 try{const r=await fetch("/api/admin/rental/manuals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Lagringen kunne ikke bekreftes.");router.refresh();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <form onSubmit={save} className={styles.panel}><h2>Dokumentopplysninger</h2>{version&&<p>Siste versjon: {version.published?"Publisert":"Upublisert"} · {version.created_at}</p>}
 {[[ "manufacturer","Produsent",120],["model","Nøyaktig modell / variant",120],["url","Offisiell bruksanvisning (HTTPS)",1800],["language","Språk",40]].map(([k,label,max])=><label key={k}>{label}<input required maxLength={max} value={v[k]} onChange={e=>edit(k,e.target.value)} disabled={busy}/></label>)}
 {rentalManualUrl(v.url)&&<a href={rentalManualUrl(v.url)} target="_blank" rel="noopener noreferrer">Åpne og kontroller dokumentlenken</a>}
 <label>Supplerende sikkerhetsinformasjon fra produsenten<textarea maxLength={2000} rows={5} value={v.safetyNote} onChange={e=>edit("safetyNote",e.target.value)} disabled={busy}/></label><p>Ikke legg inn personopplysninger, interne notater eller egne tekniske instrukser som ikke er kontrollert mot produsentens dokumentasjon.</p>
 <label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input style={{width:22,minHeight:22}} type="checkbox" checked={v.published} onChange={e=>edit("published",e.target.checked)} disabled={busy||!publicEnabled}/> Publiser kundeside for denne versjonen</label>
 <label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input style={{width:22,minHeight:22}} type="checkbox" checked={v.verified} onChange={e=>edit("verified",e.target.checked)} disabled={busy}/> Jeg har kontrollert at lenken er offisiell, tilgjengelig, gjelder riktig maskin og at sikkerhetsinformasjonen er korrekt.</label>
 {error&&<p role="alert">{error}</p>}<button disabled={busy||!enabled||!v.verified}>{busy?"Lagrer …":"Lagre ny dokumentversjon"}</button></form>;
}
