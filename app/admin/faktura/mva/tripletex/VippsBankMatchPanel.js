"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./TripletexReceipts.module.css";
const money=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const minusDays=(day,n)=>new Date(Date.parse(day+"T00:00:00Z")-
 n*86400000).toISOString().slice(0,10);
const labels={
 possible_with_reference:"Mulig treff – banktekst inneholder Vipps eller referansen",
 possible_already_reconciled:"Banktransaksjonen er allerede matchet i Tripletex – kontroller motpost",
 possible_amount_date:"Mulig treff – bare beløp og dato",
 ambiguous:"Flere mulige banktransaksjoner – manuell kontroll",
 not_found:"Ingen tilsvarende banktransaksjon funnet",
 no_statement_coverage:"Mangler kontoutskrift for aktuell dato",
 partial_statement_coverage:"Ufullstendig kontoutskrift for perioden"
};
export default function VippsBankMatchPanel({unit,from,to,cacheInfo}){
 const [checking,setChecking]=useState(false);
 const [access,setAccess]=useState(null);
 const [error,setError]=useState("");
 const [accountId,setAccountId]=useState("");
 const [matchFrom,setMatchFrom]=useState(()=>
  minusDays(to,30)>from?minusDays(to,30):from);
 const [matchTo,setMatchTo]=useState(to);
 const [match,setMatch]=useState(null);
 const requestRef=useRef(null);
 useEffect(()=>{
  requestRef.current?.abort();
  requestRef.current=null;setChecking(false);
  setAccess(null);setError("");setAccountId("");setMatch(null);
  setMatchFrom(minusDays(to,30)>from?minusDays(to,30):from);
  setMatchTo(to);
  return ()=>requestRef.current?.abort();
 },[unit,from,to]);
 const validRange=matchFrom>=from&&matchTo<=to&&matchFrom<=matchTo&&
  Number.isFinite(Date.parse(matchFrom))&&Number.isFinite(Date.parse(matchTo))&&
  (Date.parse(matchTo)-Date.parse(matchFrom))/86400000<31;
 async function checkAccess(selectedAccountId=null){
  if(checking||unit!=="service")return;
  requestRef.current?.abort();
  const controller=new AbortController();
  requestRef.current=controller;
  setChecking(true);setError("");setAccess(null);setMatch(null);
  try{
   const query=new URLSearchParams({mode:"accounts"});
   if(selectedAccountId)query.set("accountId",selectedAccountId);
   const response=await fetch("/api/admin/tripletex/vipps-bank-match?"+query,{
    cache:"no-store",signal:controller.signal
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Kunne ikke lese Tripletex-banktilgang.");
   if(controller.signal.aborted)return;
   setAccess(data);
   setAccountId(String(data.checkedAccountId||selectedAccountId||""));
  }catch(e){
   if(!controller.signal.aborted)setError(e.message||"Banktilgangen kunne ikke kontrolleres.");
  }finally{if(requestRef.current===controller){
   requestRef.current=null;setChecking(false);
  }}
 }
 async function checkMatches(){
  if(checking||!access?.bankReadAccess||!accountId||!validRange)return;
  requestRef.current?.abort();
  const controller=new AbortController();
  requestRef.current=controller;
  setChecking(true);setError("");setMatch(null);
  try{
   const q=new URLSearchParams({
    mode:"match",accountId,from:matchFrom,to:matchTo
   });
   const response=await fetch("/api/admin/tripletex/vipps-bank-match?"+q,{
    cache:"no-store",signal:controller.signal
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Banktransaksjonene kunne ikke kontrolleres.");
   if(!controller.signal.aborted)setMatch(data);
  }catch(e){
   if(!controller.signal.aborted)setError(e.message||"Bankmatch mislyktes.");
  }finally{if(requestRef.current===controller){
   requestRef.current=null;setChecking(false);
  }}
 }
 return <section style={{padding:14,border:"1px solid #cbd6dd",
  borderRadius:10,margin:"16px 0"}}>
  <h3 style={{margin:"0 0 5px",fontSize:18}}>
   Bankmatch mot Tripletex-kontoutskrift
  </h3>
  <p className={styles.hint} style={{margin:"0 0 12px"}}>
   Lesebasert kontroll som ser etter mulige banktransaksjoner for planlagte
   Vipps-utbetalinger. Beløpstreff er ikke automatisk bekreftelse, og denne
   funksjonen verken bokfører eller lukker poster.
  </p>
  {unit!=="service"?<p className={styles.hint}>
   Aadland Utleie må kontrolleres separat.</p>:<>
   <button type="button" disabled={checking} onClick={()=>checkAccess()}
    className={styles.primary}>
    {checking?"Kontrollerer …":"Kontroller banktilgang i Tripletex"}
   </button>
   {access&&<div style={{marginTop:10}}>
    <p role="status" className={styles.hint}>
     {access.bankReadAccess?
      "Tripletex tillater lesing av kontoutskrifter via API. "+
       (access.hasStatementData?(access.transactionReadAccess===true?
        "Kontoutskrift og banktransaksjoner kan leses.":
        "Det finnes kontoutskrifter, men transaksjonstilgang er ikke endelig bekreftet."):
        "Ingen kontoutskrift for første bankkonto. Transaksjonstilgang kan ikke testes ennå."):
      access.reason}
    </p>
    {access.bankAccounts?.length>0&&<>
     <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}>
      <label style={{display:"grid",gap:4,fontSize:13,flex:"1 1 220px"}}>
       Bankkonto hvor Vipps skal betale inn
       <select disabled={checking} value={accountId} onChange={e=>{
        const newId=e.target.value;setMatch(null);setAccountId(newId);
        if(newId)checkAccess(newId);
       }}>
        <option value="">Velg konto i Tripletex</option>
        {access.bankAccounts.map(a=><option key={a.id} value={a.id}>
         {a.number} – {a.name}</option>)}
       </select>
      </label>
      <label style={{display:"grid",gap:4,fontSize:13}}>
       Fra dato
       <input type="date" value={matchFrom} min={from} max={to}
        disabled={checking} onChange={e=>{setMatchFrom(e.target.value);setMatch(null);}}/>
      </label>
      <label style={{display:"grid",gap:4,fontSize:13}}>
       Til dato
       <input type="date" value={matchTo} min={from} max={to}
        disabled={checking} onChange={e=>{setMatchTo(e.target.value);setMatch(null);}}/>
      </label>
     </div>
     <p className={styles.hint}>Velg maksimalt 31 avsluttede dager om gangen.
      Oppgjør uten dokumentert bankinnbetaling må fortsatt godkjennes manuelt.</p>
     <button type="button" disabled={checking||!access.bankReadAccess||!accountId||!validRange}
      onClick={checkMatches}>
      Finn mulige Vipps-innbetalinger i banken
     </button>
     {!validRange&&<p className={styles.hint}>
      Velg datoer innenfor den lagrede perioden, maks 31 dager.</p>}
    </>}
    {!access.bankAccounts?.length&&
     <p className={styles.hint}>Ingen aktiv bankkonto funnet i Tripletex-kontoplanen.</p>}
   </div>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {match&&<div style={{marginTop:12}}>
    <strong>{match.payoutCount} Vipps-utbetalinger i perioden</strong>
    {match.matches.length>0&&<p role="status" style={{margin:"7px 0",fontWeight:600}}>
     {match.matches.filter(x=>x.status==="possible_with_reference"||
      x.status==="possible_amount_date").length} mulige banktreff ·
     {" "}{match.matches.filter(x=>x.status==="possible_already_reconciled").length}
     allerede matchet i Tripletex ·
     {" "}{match.matches.filter(x=>x.status==="ambiguous").length} tvetydige ·
     {" "}{match.matches.filter(x=>x.status==="not_found"||
      x.status==="partial_statement_coverage"||
      x.status==="no_statement_coverage").length} uten sikker bankmatch
    </p>}
    <p className={styles.hint}>
     Bankkonto {match.bankAccount.number} – {match.bankAccount.name}.
     {" "}{match.bankStatementsRead} kontoutskrifter undersøkt.
    </p>
    {match.matches.length>0&&<div style={{overflowX:"auto"}}>
     <table style={{width:"100%",marginTop:8}}>
      <thead><tr><th>Vipps-dato</th><th>Utbetaling</th><th>Bankmatch</th></tr></thead>
      <tbody>{match.matches.map(x=><tr key={x.date+"|"+x.reference}>
       <td>{x.date}</td><td>{money(x.amountOre)}</td>
       <td><strong>{labels[x.status]||"Manuell kontroll"}</strong>
        {x.candidate&&<small style={{display:"block",marginTop:4}}>
         Bankdato {x.candidate.date} · {money(x.candidate.amountOre)}
         {x.candidate.description?" · "+x.candidate.description:""}
        </small>}
        <small style={{display:"block",opacity:0.75,marginTop:4}}>
         Registrert i Aadland Service → Tripletex:
         {" "}{x.transferStatus==="confirmed"?"Bokført":
          x.transferStatus==="not_transferred"?"Ikke bokført":"Må kontrolleres"}
        </small>
        {x.candidate&&<small style={{display:"block",fontWeight:600,marginTop:4}}>
         Bankavstemming i Tripletex:
         {" "}{x.candidate.bankReconciled===true?"Allerede matchet – undersøk før ny bokføring":
         x.candidate.bankReconciled===false?"Ikke registrert matchet":
         "Ukjent – feltet ble ikke returnert av Tripletex"}
        </small>}
        {x.previouslyReconciledCount>0&&!x.candidate&&
         <small style={{display:"block",fontWeight:600}}>
          Minst ett av banktreffene er allerede matchet i Tripletex.
         </small>}
        {x.candidateCount>1&&<small style={{display:"block"}}>
         {x.candidateCount} mulige treff – ikke velg automatisk.</small>}
       </td>
      </tr>)}</tbody>
     </table>
    </div>}
    <p className={styles.hint} style={{marginTop:10}}>
     {match.disclaimer||match.note}
    </p>
   </div>}
  </>}
 </section>;
}
