"use client";
import {useState,useRef} from "react";
import Link from "next/link";
import {RENTAL_RELEASE_BLOCKERS} from "../../lib/rentalReleaseReadiness.mjs";
import {SIGNING_TESTS} from "../../lib/signingTestSpecs.mjs";
import styles from "./signingPortal.module.css";
export default function SigningTestPanel(){
 const [results,setResults]=useState({}),[active,setActive]=useState(""),[running,setRunning]=useState(false);
 const lock=useRef(false);
 async function run(id){
  if(lock.current)return;lock.current=true;setRunning(true);setActive(id);
  try{const r=await fetch("/api/admin/signing/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id}),cache:"no-store"});const data=await r.json();
  if(!r.ok||data.id!==id||data.mode!=="synthetic")throw Error("Test utilgjengelig");
  setResults(x=>({...x,[id]:data}));}
  catch{setResults(x=>({...x,[id]:{passed:false,checks:[{label:"Kunne ikke kjøre servertesten. Sjekk innlogging og tilkobling.",ok:false}]}}));}
  finally{lock.current=false;setRunning(false);}
 }
 const passed=SIGNING_TESTS.filter(t=>results[t.id]?.passed).length;
 return <section className={styles.portal}><div className={styles.brand}><span>AADLAND UTLEIE</span><h1>Samlet testpanel</h1><p>{passed} av {SIGNING_TESTS.length} syntetiske tester bestått i denne visningen</p></div><p className={styles.notice}>Ingen ekte kundeavtaler, e-post eller betaling. Dette panelet kjører syntetiske servertester. Isolerte PostgreSQL-tester kjøres separat i GitHub; leverandørintegrasjoner og full nettlesertest gjenstår. Resultater her lagres ikke.</p>
 <div className={styles.list}>{SIGNING_TESTS.map(t=><article key={t.id} className={styles.row}><div><h2>{t.title}</h2><p>{t.description}</p><p>{results[t.id]?results[t.id].passed?"Bestått":"Ikke bestått":"Ikke testet"}</p></div><button type="button" disabled={running} onClick={()=>run(t.id)}>{running&&active===t.id?"Tester …":"Kjør test"}</button></article>)}</div>
 {active&&<section className={styles.detail} aria-live="polite"><h2>{SIGNING_TESTS.find(t=>t.id===active)?.title}</h2>{running?<p>Servertesten kjører.</p>:results[active]?.checks.map((c,i)=><p key={i}>{c.ok?"✓":"✗"} {c.label}</p>)}<p>Kun syntetisk testresultat – ikke lanseringsgodkjenning.</p></section>}
 <section className={styles.detail}><h2>Før lansering – {RENTAL_RELEASE_BLOCKERS.length} åpne kontrollområder</h2><p>Beståtte syntetiske tester lukker ikke disse punktene. Ingen aktiveringsknapp her.</p><div className={styles.list}>{RENTAL_RELEASE_BLOCKERS.map(b=><article key={b.id} className={styles.row}><div><h2>{b.title}</h2><p>{b.status==="owner"?"Eier / oppsett":b.status==="manual"?"Manuell kontroll":"Integrasjon gjenstår"}</p><p>{b.detail}</p></div>{b.href&&<Link className="btn alt" href={b.href}>Åpne</Link>}</article>)}</div></section>
 </section>;
}
