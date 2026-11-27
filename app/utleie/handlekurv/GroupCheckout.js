"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {checkoutRequest,checkoutAgreementResponse,checkoutConsent,isCheckoutId} from "../../../lib/rentalCheckoutUi.mjs";
import styles from "./cart.module.css";
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const msg={wrong_code:"Feil kode. Kontroller e-posten.",limited:"For mange forsøk. Vent før du prøver igjen.",expired:"Koden er utløpt. Be om ny kode dersom reservasjonen fortsatt er aktiv.",locked:"Koden er låst.",delivery_unconfirmed:"E-postlevering er ikke bekreftet.",login_required:"Logg inn på Min side og gå tilbake.",quote_changed:"Pris eller tilgjengelighet er endret. Kontroller bestillingen på nytt.",unavailable:"Reservasjonen eller avtalen er ikke tilgjengelig. Kontakt oss før du oppretter en ny bestilling.",disabled:"Bestilling er ikke åpnet.",invalid_document:"Avtalen kunne ikke genereres. Kontakt oss.",invalid:"Kontroller opplysningene.",unconfirmed:"Resultatet er ikke bekreftet. Bruk samme forespørsel ved nytt forsøk.",retry:"Forsøk igjen med samme kode."};
const demoAgreement="00000000-0000-4000-8000-000000000901",demoGroup="00000000-0000-4000-8000-000000000902",demoChallenge="00000000-0000-4000-8000-000000000903";
export default function GroupCheckout({quote,lines=[],sales=[],enabled=false,customerScope="",demo=false,onLocked}){
 const key="aadland-group-checkout-v1:"+customerScope;
 const [pending,setPending]=useState(null),[ready,setReady]=useState(false),[terms,setTerms]=useState(false),[agreement,setAgreement]=useState(null),[name,setName]=useState(""),[consent,setConsent]=useState(false),[challenge,setChallenge]=useState(null),[code,setCode]=useState(""),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[checkedStatus,setCheckedStatus]=useState(false),[cancelConfirm,setCancelConfirm]=useState(false);
 const lock=useRef(false),snapshot=useRef(null);
 useEffect(()=>{let p=null;if(enabled&&!demo&&customerScope){try{const x=JSON.parse(sessionStorage.getItem(key)||"null");if(isCheckoutId(x?.requestId)&&typeof x.quoteDigest==="string"&&Array.isArray(x.lines)&&Array.isArray(x.consumables))p=x;}catch{}}setPending(p);setReady(true);onLocked?.(!!p);},[key,enabled,demo]);
 const available=enabled||demo;
 const consentInput=checkoutConsent(agreement,name,consent);
 async function post(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});return await r.json().catch(()=>({status:"unconfirmed"}));}
 async function status(a){
  if(demo){setCheckedStatus(true);return;}
  const result=await post("/api/customer/group-signing",{action:"status",agreementId:a.agreementId});
  if(result.status==="signed"){setSigned(true);setCheckedStatus(true);}
  else if(result.status==="unsigned")setCheckedStatus(true);
  else{setCheckedStatus(false);setNotice(msg[result.status]||msg.unconfirmed);}
 }
 async function reserve(){
  if(lock.current||!available||!ready||!demo&&!customerScope)return;
  const p=pending||checkoutRequest({quote,lines,sales,accepted:terms,requestId:crypto.randomUUID()});if(!p)return;
  lock.current=true;setBusy(true);setNotice("");setCheckedStatus(false);
  try{
   // Persist request before POST; never persist name, consent to sign or OTP.
   if(!demo){sessionStorage.setItem(key,JSON.stringify(p));}
   setPending(p);onLocked?.(true);
   const result=demo?{status:"agreement_ready",groupId:demoGroup,agreementId:demoAgreement,documentDigest:"b".repeat(64),quoteDigest:p.quoteDigest,termsVersion:p.termsVersion,expiresAt:new Date(Date.now()+1800000).toISOString(),payableOre:quote.snapshot.payableOre,depositOre:quote.snapshot.depositOre,orderNumber:"DEMO-125"}:await post("/api/customer/group-checkout",p);
   const a=checkoutAgreementResponse(result,p);if(!a){setNotice(msg[result.status]||msg.unconfirmed);return;}
   setAgreement(a);await status(a);
  }catch{setNotice("Kunne ikke bekrefte reservasjonen. Behold samme forespørsel og prøv igjen.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function refreshStatus(){
  if(!agreement||lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{await status(agreement);}catch{setNotice(msg.unconfirmed);}finally{lock.current=false;setBusy(false);}
 }
 async function issue(){
  if(!consentInput||!checkedStatus||signed||lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{
   const r=demo?{status:"sent",challengeId:demoChallenge,expiresAt:new Date(Date.now()+600000).toISOString()}:await post("/api/customer/group-signing",{...consentInput,action:"issue"});
   if(r.status!=="sent"||!isCheckoutId(r.challengeId)||!Number.isFinite(Date.parse(r.expiresAt))){setNotice(msg[r.status]||msg.unconfirmed);return;}
   snapshot.current=consentInput;setChallenge(r);setCode("");setNotice(demo?"Demokode: 123456. Ingen e-post sendt.":"Kode sendt til den bekreftede e-postadressen din.");
  }catch{setNotice(msg.unconfirmed);}finally{lock.current=false;setBusy(false);}
 }
 async function verify(){
  if(!snapshot.current||!challenge||! /^\d{6}$/.test(code)||lock.current||signed)return;
  lock.current=true;setBusy(true);setNotice("");
  try{
   const r=demo?{status:code==="123456"?"signed":"wrong_code"}:await post("/api/customer/group-signing",{...snapshot.current,action:"verify",challengeId:challenge.challengeId,code});
   if(r.status==="signed"){setSigned(true);setCode("");setNotice("");}
   else{setNotice(msg[r.status]||msg.unconfirmed);setCode("");if(["expired","locked","closed"].includes(r.status))setChallenge(null);}
  }catch{setNotice(msg.unconfirmed);}finally{lock.current=false;setBusy(false);}
 }
 async function cancel(){
  if(!pending||!cancelConfirm||lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{const result=demo?{status:"cancelled"}:await post("/api/customer/group-cancel",{requestId:pending.requestId,confirmed:true});
   if(result.status!=="cancelled"){setNotice(result.status==="payment_review"?"Betaling kan være påbegynt. Reservasjonen beholdes til oppgjøret er avklart.":msg[result.status]||msg.unconfirmed);return;}
   if(!demo)sessionStorage.removeItem(key);resetDemo();setCancelConfirm(false);setNotice(demo?"Demoreservasjon avbrutt.":"Reservasjonen er avbrutt. Du kan kontrollere handlekurven på nytt.");
  }catch{setNotice(msg.unconfirmed);}finally{lock.current=false;setBusy(false);}
 }
 function resetDemo(){setPending(null);setAgreement(null);setChallenge(null);setSigned(false);setCode("");setName("");setTerms(false);setConsent(false);setCheckedStatus(false);setCancelConfirm(false);setNotice("");onLocked?.(false);}
 if(!available||!ready)return null;
 if(!demo&&!customerScope)return <section className={styles.root+" "+styles.line+" "+styles.checkout}><h2>Logg inn før bestilling</h2><Link href="/min-side">Gå til Min side</Link><p>Gå tilbake til handlekurven etter innlogging.</p></section>;
 return <section className={styles.root+" "+styles.line+" "+styles.checkout}><h2>{demo?"TESTMODUS – reservasjon og signering":"Reservasjon og signering"}</h2>{demo&&<p>Fiktive data. Ingen database, e-post eller betaling.</p>}
 {!pending&&!agreement&&quote?.snapshot&&<><p>Leie og varer: <strong>{kr(quote.snapshot.payableOre)}</strong> · Depositum separat: {kr(quote.snapshot.depositOre)}</p><label><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/>Jeg godtar <a href="/vilkar/utleie/2026-11-25" target="_blank" rel="noreferrer">utleievilkårene</a> og ønsker å reservere.</label></>}
 {!agreement&&(pending||quote?.snapshot)&&<button type="button" disabled={busy||!pending&&!terms} onClick={reserve}>{busy?"Kontrollerer …":pending?"Gjenoppta samme reservasjon":"Reserver og hent leieavtale"}</button>}
 {pending&&!agreement&&<p>Samme forespørsels-ID beholdes ved nytt forsøk. Ikke opprett en ny ordre hvis resultatet er ukjent.</p>}
 {agreement&&<><h3>Ordre {agreement.orderNumber}</h3><p>Reservasjonen gjelder til {new Date(agreement.expiresAt).toLocaleString("nb-NO",{timeZone:"Europe/Oslo"})}.</p><p>Leie og varer: {kr(agreement.payableOre)} · Depositum separat: {kr(agreement.depositOre)}</p>{demo?<p>Fiktiv avtale: les demovilkårene før du tester.</p>:<a href={agreement.documentUrl} target="_blank" rel="noreferrer">Åpne original leieavtale (PDF)</a>}
 {!checkedStatus&&!signed&&<button type="button" disabled={busy} onClick={refreshStatus}>Kontroller signeringsstatus</button>}
 {checkedStatus&&!signed&&<><label>Fullt navn<input value={name} maxLength={120} disabled={busy||!!challenge} onChange={e=>setName(e.target.value)}/></label><label><input type="checkbox" checked={consent} disabled={busy||!!challenge} onChange={e=>setConsent(e.target.checked)}/>Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.</label>
 {!challenge?<button type="button" disabled={busy||!consentInput} onClick={issue}>Send engangskode</button>:<><label>Engangskode<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></label><button type="button" disabled={busy||code.length!==6} onClick={verify}>Signer avtalen</button><button type="button" disabled={busy} onClick={issue}>Be om ny kode</button><small>Koden gjelder i maksimalt ti minutter. Ny kode er underlagt ventetid.</small></>}</>}
 {signed&&<><h3>✓ Avtalen er signert{demo?" (demo)":""}</h3><p>Betaling er ikke gjennomført. Vipps-betalingen er ikke koblet til denne flyten ennå.</p>{!demo&&<Link href="/min-side/signering">Mine avtaler</Link>}</>}</>}
 {pending&&<div><button type="button" disabled={busy} onClick={()=>setCancelConfirm(v=>!v)}>Avbryt reservasjon</button>{cancelConfirm&&<><p>Avbryt denne forespørselen? Ubetalt reservasjon frigjøres bare etter bekreftelse fra serveren. Påbegynt betaling må avklares separat.</p><button type="button" disabled={busy} onClick={cancel}>Bekreft avbrytelse</button><button type="button" disabled={busy} onClick={()=>setCancelConfirm(false)}>Behold bestilling</button></>}</div>}
 {notice&&<p role="status">{notice}</p>}{demo&&<button type="button" disabled={busy} onClick={resetDemo}>Start testen på nytt</button>}</section>;
}
