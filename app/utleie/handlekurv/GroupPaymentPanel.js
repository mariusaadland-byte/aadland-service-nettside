"use client";
import {useRef,useState} from "react";
import {groupVippsRedirect} from "../../../lib/groupVippsRedirect.mjs";
const labels={await_customer:"Åpne Vipps for å godkjenne betalingen.",authorized_not_captured:"Beløpet er godkjent og reservert i Vipps. Det er ikke bekreftet trukket.",confirmed:"Leiebetalingen er bekreftet gjennomført.",released:"Betalingen er avsluttet uten trekk. Reservasjonen er frigjort. Start en ny bestilling ved behov.",release_candidate:"Vipps viser avbrutt eller utløpt betaling. Reservasjonen må avklares før ny bestilling.",unconfirmed:"Betalingsstatus er ikke bekreftet. Kontroller samme betaling igjen.",review:"Betalingen må kontrolleres manuelt.",disabled:"Vipps Utleie er ikke åpnet.",login_required:"Logg inn på Min side først.",review_refund:"Refusjon må avklares.",review_partial_capture:"Delvis trekk krever manuell kontroll."};
export default function GroupPaymentPanel({groupId,amountOre,canStart=false,demo=false}){
 const [state,setState]=useState(""),[url,setUrl]=useState(""),[busy,setBusy]=useState(false);const lock=useRef(false);
 async function run(action){
 if(lock.current)return;lock.current=true;setBusy(true);setUrl("");
 try{
 const r=demo?{status:action==="start"?"await_customer":state==="await_customer"?"authorized_not_captured":"authorized_not_captured"}:await fetch("/api/customer/group-vipps",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId,action,confirmed:action==="start"}),cache:"no-store"}).then(x=>x.json());
 setState(r.status||"unconfirmed");setUrl(groupVippsRedirect(r.redirectUrl)||"");
 }catch{setState("unconfirmed");}finally{lock.current=false;setBusy(false);}
 }
 return <div><h3>Vipps Utleie{demo?" – demo":""}</h3>{Number.isSafeInteger(amountOre)&&<p>Leie og varer: <strong>{new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(amountOre/100)}</strong>. Depositum separat.</p>}
 {canStart&&!state&&<button type="button" disabled={busy} onClick={()=>run("start")}>Betal med Vipps</button>}
 {url&&state==="await_customer"&&<p><a href={url} rel="noreferrer">Åpne Vipps</a></p>}
 {demo&&state==="await_customer"&&<p>Fiktiv Vipps-reservasjon. Ingen ekte betaling.</p>}
 {!["confirmed","released"].includes(state)&&<button type="button" disabled={busy} onClick={()=>run("status")}>Kontroller betalingsstatus</button>}
 {state&&<p role="status">{labels[state]||labels.review}</p>}
 <small>En retur fra Vipps er ikke betalingsbekreftelse. Bare kontrollert status fra betalingsleverandøren kan bekrefte betaling.</small></div>;
}
