"use client";
import {useState} from "react";
import styles from "./signingPortal.module.css";
const kr=v=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(v/100);
const sample={id:"demo",orderNumber:"DEMO-125",description:"Skadet feste på demoverktøy. Fiktiv reparasjonskostnad.",amountOre:45000,depositOre:200000,photos:[],response:null,note:""};
export default function DamagePortal({admin=false,demo=true,rows=[],responseEnabled=false}){
 const [mode,setMode]=useState(admin?"admin":"customer"),[photos,setPhotos]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[answers,setAnswers]=useState({}),[draft,setDraft]=useState({}),[notes,setNotes]=useState({});
 async function validate(file){
  if(!file||busy||photos.length>=12)return;
  setBusy(true);setNotice("");
  try{const form=new FormData();form.append("file",file);
   const r=await fetch("/api/admin/damage/photo-test",{method:"POST",body:form,cache:"no-store"}),d=await r.json();
   if(!r.ok||d.mode!=="validation_only"||!d.photo?.digest)throw Error(d.error||"Test mislyktes.");
   setPhotos(old=>old.some(x=>x.digest===d.photo.digest)?old:[...old,d.photo]);setNotice("Fil kontrollert på serveren. Ikke lagret.");
  }catch(e){setNotice(e.message||"Bildet kunne ikke kontrolleres.");}finally{setBusy(false);}
 }
 async function submit(row){
  if(busy||!draft[row.id])return;setBusy(true);setNotice("");
  try{if(!demo){const r=await fetch("/api/customer/damage-response",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({claimId:row.id,claimDigest:row.claimDigest,response:draft[row.id],note:notes[row.id]||""})});if(!r.ok)throw Error("Svar ble ikke bekreftet av serveren.");}
   setAnswers(x=>({...x,[row.id]:draft[row.id]}));setNotice(demo?"Demosvar registrert kun i denne visningen.":"Svar registrert.");
  }catch(e){setNotice(e.message);}finally{setBusy(false);}
 }
 return <section className={styles.portal}><div className={styles.brand}><span>AADLAND UTLEIE</span><h1>Skadesaker</h1><p>{demo?"Testvisning – ingen ekte krav eller trekk":"Mine dokumenterte skadekrav"}</p></div>
 {admin&&demo&&<div className={styles.switch}><button aria-pressed={mode==="admin"} onClick={()=>setMode("admin")}>Administrasjon</button><button aria-pressed={mode==="customer"} onClick={()=>setMode("customer")}>Kundevisning</button></div>}
 {mode==="admin"&&<article className={styles.detail}><h2>Test sikker bildekontroll</h2><p>Velg kun et ufølsomt testbilde. JPG, PNG eller WebP, maks 3 MB. Ingen filer lagres.</p><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||photos.length>=12} onChange={e=>{const file=e.target.files?.[0];e.target.value="";validate(file);}}/><p>{photos.length} av 12 unike testbilder kontrollert</p>{photos.map(p=><p key={p.digest}>{p.extension.toUpperCase()} · {p.size} byte · {p.digest.slice(0,12)}…</p>)}</article>}
 <div className={styles.list}>{(demo?[sample]:rows).map(row=>{
 const answer=row.response||answers[row.id],remaining=Math.max(0,row.depositOre-row.amountOre);
 return <article key={row.id} className={styles.detail}><h2>Ordre {row.orderNumber}</h2><p>{row.description}</p><dl><dt>Depositum</dt><dd>{kr(row.depositOre)}</dd><dt>Dokumentert krav</dt><dd>{kr(row.amountOre)}</dd><dt>Mulig tilbakebetaling ved godkjent krav</dt><dd>{kr(remaining)}</dd></dl>
 <p>{answer?answer==="accepted"?"Krav godtatt – avventer manuell behandling":"Krav bestridt – manuell behandling":"Avventer kundens svar"}</p>
 {!demo&&row.costDocument&&<p><a href={row.costDocument.url}>Last ned kostnadsdokumentasjon</a></p>}
 {!demo&&row.photos.map((photo,i)=><p key={photo.digest}><a href={photo.url}>Last ned skadebilde {i+1}</a></p>)}
 {mode==="customer"&&!answer&&(demo||responseEnabled)&&<div><p>Velg svar. Ingen penger trekkes automatisk.</p><div className={styles.switch}><button aria-pressed={draft[row.id]==="accepted"} onClick={()=>setDraft(x=>({...x,[row.id]:"accepted"}))}>Godta kravet</button><button aria-pressed={draft[row.id]==="disputed"} onClick={()=>setDraft(x=>({...x,[row.id]:"disputed"}))}>Bestrid kravet</button></div><label>Merknad<textarea style={{display:"block",width:"100%",minHeight:80,background:"#fff",color:"#18222e"}} maxLength={2000} value={notes[row.id]||""} onChange={e=>setNotes(x=>({...x,[row.id]:e.target.value}))}/></label><p>Kontroller valget før du sender. Registrert svar kan ikke overskrives.</p><button disabled={busy||!draft[row.id]} onClick={()=>submit(row)}>Bekreft svar</button></div>}
 </article>})}{!demo&&!rows.length&&<p>Ingen registrerte skadesaker.</p>}</div><p role="status">{notice}</p><p>Uenighet og eventuelle erstatningskrav behandles separat fra fysisk retur.</p></section>;
}
