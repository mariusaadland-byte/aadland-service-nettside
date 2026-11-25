"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
export default function RegisterUnit({items}){
 const [itemId,setItemId]=useState(""),[serialNumber,setSerialNumber]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const lock=useRef(false),request=useRef(null),router=useRouter();
 async function submit(e){
  e.preventDefault();if(lock.current||!itemId)return;lock.current=true;setBusy(true);setError("");
  try{
   if(!request.current)request.current=crypto.randomUUID();
   const r=await fetch("/api/admin/rental/units",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId,serialNumber,requestId:request.current})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Registreringen kunne ikke bekreftes.");
   router.push("/admin/utleie/enheter/"+encodeURIComponent(d.id));router.refresh();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <form onSubmit={submit} className="card"><h2>Registrer fysisk enhet</h2><label>Produkttype<select required value={itemId} disabled={busy} onChange={e=>{setItemId(e.target.value);request.current=null}}><option value="">Velg produkt</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label>Serienummer (valgfritt)<input value={serialNumber} maxLength={100} disabled={busy} onChange={e=>{setSerialNumber(e.target.value);request.current=null}}/></label><button type="submit" className="btn" disabled={!itemId||busy}>{busy?"Lagrer …":"Registrer enhet og QR-kode"}</button>{error&&<p role="alert">{error}</p>}</form>;
}
