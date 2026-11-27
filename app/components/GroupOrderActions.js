"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {orderActions,actionLabels,actionSuccess} from "../../lib/groupOrderActions.mjs";
import styles from "./damageAdmin.module.css";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const returnActions=["receive","resolve","plan","record_refund"];
const checksText={identity:"Kunde og identitet kontrollert",condition:"Tilstand, funksjon og tilbehør kontrollert",instructions:"Sikkerhet, instruksjon og retur gjennomgått"};
export default function GroupOrderActions({row,demo,enabled}){
 const router=useRouter(),lock=useRef(false),[action,setAction]=useState(""),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[done,setDone]=useState(false),[snapshot,setSnapshot]=useState(null);
 const actions=demo?["deposit","prepare","capture","handover","receive","resolve","plan","record_refund"]:orderActions(row);
 function open(a){setAction(a);setDraft({id:crypto.randomUUID(),reference:"",proofDigest:"",note:"",unitId:"",bookingId:"",maintenanceEventId:"",condition:"",checks:{},units:{},confirmed:false});setNotice("");setDone(false);setSnapshot(null);}
 const update=(k,v)=>setDraft(d=>({...d,[k]:v}));
 const choose=action==="receive"||action==="resolve";
 const units=row.units.filter(u=>action==="receive"?u.unitId&&!u.condition&&u.status==="active":u.unitId&&u.condition&&u.condition!=="ok"&&!u.released);
 const unit=units.find(u=>u.id===draft?.bookingId);
 const amount=action==="record_refund"?row.settlement?.refundOre??(demo?row.depositOre:null):row.depositOre;
 const proofRequired=action==="deposit"||action==="record_refund"&&amount>0;
 const valid=draft?.confirmed&&(demo||enabled)&&(!proofRequired||draft.reference.trim()&&/^[a-f0-9]{64}$/.test(draft.proofDigest))&&(action!=="prepare"||row.units.every(u=>draft.units[u.id]?.trim())&&Object.keys(checksText).every(k=>draft.checks[k]))&&(!choose||!!unit&&draft.unitId.trim()&&(action==="resolve"?!!draft.maintenanceEventId:!!draft.condition&&(!["damage","missing_accessory"].includes(draft.condition)||draft.note.trim())&&(draft.condition!=="ok"||draft.checks.condition)));
 function payload(){
 const p={groupId:row.id,action,confirmed:true,reportId:row.reportId||draft.id,requestId:action==="record_refund"?row.settlement?.requestId:draft.id,receiptId:draft.id,amountOre:amount,reference:draft.reference,proofDigest:draft.proofDigest,note:draft.note,bookingId:draft.bookingId,unitId:draft.unitId,maintenanceEventId:draft.maintenanceEventId,condition:draft.condition,checks:action==="receive"?{equipment:true,condition:!!draft.checks.condition,accessories:!!draft.checks.condition}:draft.checks,units:row.units.map(u=>({bookingId:u.id,unitId:draft.units[u.id]}))};
 return p;
 }
 async function run(){
 if(lock.current||done||(!snapshot&&!valid))return;
 lock.current=true;setBusy(true);setNotice("");
 const p=snapshot||payload();setSnapshot(p);
 try{
 const r=demo?{status:actionSuccess[action][0]}:await fetch("/api/admin/rental/"+(returnActions.includes(action)?"group-return":"group-handover"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p),cache:"no-store"}).then(r=>r.json());
 if(actionSuccess[action].includes(r.status)){setDone(true);setNotice(demo?"Demohandling fullført. Ingen endringer.":"Handling bekreftet. Oppdaterer registrert ordrestatus.");if(!demo)router.refresh();}
 else setNotice("Ikke bekreftet: "+String(r.status||"ukjent")+". Kontroller status før du forsøker samme handling igjen.");
 }catch{setNotice("Resultatet er ukjent. Oppdater ordren og kontroller før samme forespørsel gjentas.");}finally{lock.current=false;setBusy(false);}
 }
 if(!demo&&!enabled)return <p>Handlingsskjermene er ikke aktivert.</p>;
 return <div className={styles.card}><h2>Behandle ordre</h2>{!actions.length&&<p>Ingen handling tilgjengelig ut fra registrert status. Oppdater eller kontroller ordren.</p>}
 {!action&&actions.map(a=><p key={a}><button className={styles.primary} onClick={()=>open(a)}>{actionLabels[a]}</button></p>)}
 {action&&draft&&<><h3>{actionLabels[action]}</h3><fieldset disabled={busy||!!snapshot} style={{border:0,padding:0,minWidth:0}}>
 {proofRequired&&<><p>Beløp: {money(amount)}. Registrering er kun manuell attestasjon, ikke bankavstemming.</p><label>Bankreferanse<input value={draft.reference} onChange={e=>update("reference",e.target.value)}/></label><label>SHA-256 av kontrollert dokumentasjon<input value={draft.proofDigest} onChange={e=>update("proofDigest",e.target.value)} maxLength={64}/></label>{demo&&<button onClick={()=>setDraft(d=>({...d,reference:"DEMO-BANK",proofDigest:"a".repeat(64)}))}>Bruk demodokumentasjon</button>}</>}
 {action==="prepare"&&<>{row.units.map(u=><label key={u.id}>{u.number} – QR/individ-ID<input value={draft.units[u.id]||""} onChange={e=>update("units",{...draft.units,[u.id]:e.target.value})}/></label>)}{Object.entries(checksText).map(([k,v])=><label key={k} className={styles.check}><input type="checkbox" checked={!!draft.checks[k]} onChange={e=>update("checks",{...draft.checks,[k]:e.target.checked})}/>{v}</label>)}</>}
 {choose&&<><label>Maskin<select value={draft.bookingId} onChange={e=>update("bookingId",e.target.value)}><option value="">Velg maskin</option>{units.map(u=><option key={u.id} value={u.id}>{u.number}</option>)}</select></label><label>Skannet QR / individ-ID<input value={draft.unitId} onChange={e=>update("unitId",e.target.value)}/></label>{action==="resolve"?<label>ID for ny vedlikeholdskontroll<input value={draft.maintenanceEventId} onChange={e=>update("maintenanceEventId",e.target.value)}/></label>:<><label>Tilstand<select value={draft.condition} onChange={e=>update("condition",e.target.value)}><option value="">Velg</option><option value="ok">I orden</option><option value="damage">Skadet</option><option value="missing_accessory">Tilbehør mangler</option><option value="uninspected">Ikke kontrollert</option></select></label>{draft.condition==="ok"&&<label className={styles.check}><input type="checkbox" checked={!!draft.checks.condition} onChange={e=>update("checks",{condition:e.target.checked})}/>Utstyr, funksjon og tilbehør kontrollert</label>}</>}</>}
 {["receive","prepare"].includes(action)&&<label>Merknad<textarea value={draft.note} maxLength={2000} onChange={e=>update("note",e.target.value)}/></label>}
 {action==="capture"&&<p>Trekk {money(row.amountOre)} i leiebetaling. Depositum er separat. Ekte trekk krever egen serverbryter og verifisert autorisasjon.</p>}
 {action==="plan"&&<p>Planlagt full tilbakebetaling: {money(row.depositOre)}. Ingen penger overføres.</p>}
 <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e=>update("confirmed",e.target.checked)}/>Jeg har kontrollert opplysningene og godkjenner denne handlingen.</label></fieldset>
 {!done&&<button className={styles.primary} disabled={busy||!snapshot&&!valid} onClick={run}>{busy?"Kontrollerer …":snapshot?"Kontroller samme handling igjen":"Bekreft handling"}</button>}
 <p><button disabled={busy} onClick={()=>{setAction("");setDraft(null);setSnapshot(null);setNotice("");}}>{done?"Lukk":"Tilbake"}</button></p>{notice&&<p role="status">{notice}</p>}</>}
 </div>;
}
