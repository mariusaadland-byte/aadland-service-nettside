"use client";
import {useMemo,useState} from "react";
import {demoSigningRows,signingPortalCounts,signingPortalFilter,SIGNING_PORTAL_STATUSES} from "../../lib/signingPortalDemo.mjs";
import styles from "./signingPortal.module.css";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function SigningPortalDemo({admin=false}){
 const [mode,setMode]=useState(admin?"admin":"customer"),[status,setStatus]=useState("all"),[query,setQuery]=useState(""),[selected,setSelected]=useState("");
 const rows=useMemo(()=>demoSigningRows(admin?mode:"customer"),[mode,admin]);
 const counts=signingPortalCounts(rows),filtered=signingPortalFilter(rows,status,query),detail=filtered.find(r=>r.id===selected);
 function changeMode(v){setMode(v);setStatus("all");setQuery("");setSelected("");}
 function changeStatus(v){setStatus(v);setSelected("");}
 return <section className={styles.portal}>
 <div className={styles.brand}><span>AADLAND SIGNERING</span><h1>{mode==="admin"?"Signeringsoversikt":"Mine avtaler"}</h1><p>Avtaler, signeringsstatus og dokumenthistorikk</p></div>
 <p className={styles.notice} role="status"><strong>Demomodus.</strong> Kun fiktive avtaler. Ingen signering, e-post, betaling eller ekte dokumenter er tilgjengelig her.</p>
 {admin&&<div className={styles.switch}><button type="button" aria-pressed={mode==="admin"} onClick={()=>changeMode("admin")}>Administrator</button><button type="button" aria-pressed={mode==="customer"} onClick={()=>changeMode("customer")}>Forhåndsvis kunde</button></div>}
 <div className={styles.stats}><button type="button" aria-pressed={status==="all"} onClick={()=>changeStatus("all")}><strong>{rows.length}</strong>Alle avtaler</button>{Object.entries(SIGNING_PORTAL_STATUSES).map(([key,label])=><button type="button" key={key} aria-pressed={status===key} onClick={()=>changeStatus(key)}><strong>{counts[key]}</strong>{label}</button>)}</div>
 <label className={styles.search}>Søk etter ordrenummer eller utstyr{mode==="admin"?" eller kunde":""}<input value={query} maxLength={100} onChange={e=>{setQuery(e.target.value);setSelected("");}} placeholder="Søk i demoavtaler"/></label>
 <p aria-live="polite">{filtered.length} avtaler i visningen</p>
 <div className={styles.list}>{filtered.map(r=><article key={r.id} className={styles.row}>
 <div><small>{r.order} · Versjon {r.revision}</small><h2>{r.title}</h2>{mode==="admin"&&<p>{r.customer}</p>}<p>{r.date} · {money(r.payableOre)}</p></div>
 <div className={styles.actions}><span className={styles[r.status]}>{SIGNING_PORTAL_STATUSES[r.status]}</span><button type="button" aria-expanded={selected===r.id} onClick={()=>setSelected(selected===r.id?"":r.id)}>{selected===r.id?"Lukk detaljer":"Vis avtale"}</button></div>
 </article>)}</div>
 {!filtered.length&&<p>Ingen demoavtaler passer med søket.</p>}
 {detail&&<section className={styles.detail} aria-label="Avtaledetaljer"><h2>{detail.order} · Versjon {detail.revision}</h2><p>{detail.title}</p><dl><dt>Status</dt><dd>{SIGNING_PORTAL_STATUSES[detail.status]}</dd><dt>Leie og kjøp inkl. mva.</dt><dd>{money(detail.payableOre)}</dd><dt>Depositum separat</dt><dd>{money(detail.depositOre)}</dd><dt>Signeringsmetode</dt><dd>E-postkode (planlagt)</dd></dl>
 <h3>Avtalehistorikk</h3>{rows.filter(r=>r.order===detail.order).sort((a,b)=>b.revision-a.revision).map(r=><p key={r.id}>Versjon {r.revision} – {SIGNING_PORTAL_STATUSES[r.status]} · {r.date}</p>)}
 <p>Avtale-PDF og signeringsbevis blir tilgjengelig når arkivet og tilgangskontrollen er ferdig testet.</p></section>}
 </section>;
}
