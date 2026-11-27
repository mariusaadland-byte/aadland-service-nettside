"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
const money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100):"Ikke bekreftet";
const labels={checked:"Vipps-status hentet. Ingen ordreendring.",changed:"Status er endret eller kan ikke oppdateres. Hent status på nytt.",confirmed:"Gjennomført betaling registrert. Ingen ny betaling opprettet.",released:"Avsluttet betaling registrert og reservasjon frigjort.",unconfirmed:"Resultatet er ikke bekreftet. Hent status på nytt før ny handling.",review:"Betalingen krever manuell kontroll.",disabled:"Betalingskontroll er ikke aktivert."};
export default function OwnerPaymentCheck({groupId,enabled}){
 const router=useRouter(),lock=useRef(false),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[confirm,setConfirm]=useState(false);
 async function run(action){
  if(!enabled||lock.current||action==="apply"&&(!confirm||result?.status!=="checked"||!result.decision))return;
  const expected=result?.digest;lock.current=true;setBusy(true);setConfirm(false);setResult(null);
  try{
   const response=await fetch("/api/admin/rental/group-payment-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId,action,...(action==="apply"?{expected,confirmed:true}:{})}),cache:"no-store"});
   const data=await response.json();setResult(data?.status?data:{status:"unconfirmed"});
   if(["confirmed","released"].includes(data.status))router.refresh();
  }catch{setResult({status:"unconfirmed"});}finally{lock.current=false;setBusy(false);}
 }
 return <div style={{marginTop:12}}><button className="btn" type="button" disabled={!enabled||busy} onClick={()=>run("check")}>{busy?"Kontrollerer …":"Hent Vipps-status"}</button>
 {!enabled&&<p>Avventer aktivering.</p>}{result&&<p role="status">{labels[result.status]||labels.review}</p>}
 {result?.facts&&<div><p>Referanse: {result.facts.reference} · Vipps-status: {result.facts.state}</p><p>Reservert totalt: {money(result.facts.authorizedOre)} · Utestående reservasjon: {money(result.facts.openOre)}</p><p>Trukket: {money(result.facts.capturedOre)} · Kansellert: {money(result.facts.cancelledOre)} · Refundert: {money(result.facts.refundedOre)}</p>
 {result.status==="checked"&&result.decision&&<><label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Jeg bekrefter at {result.decision==="release"?"reservasjonen kan frigjøres etter ny kontroll":"gjennomført betaling kan registreres lokalt"}</label><p><button className="btn alt" type="button" disabled={!confirm||busy} onClick={()=>run("apply")}>Bekreft oppdatering</button></p></>}
 </div>}<small>Ingen nye trekk, refusjoner eller betalingsforsøk utføres her.</small></div>;
}
