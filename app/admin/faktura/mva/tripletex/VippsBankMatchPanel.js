"use client";
import {useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";
const money=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const minusDays=(day,n)=>new Date(Date.parse(day+"T00:00:00Z")-
 n*86400000).toISOString().slice(0,10);
const labels={
 possible_with_reference:"Mulig treff – banktekst inneholder Vipps eller referansen",
 possible_amount_date:"Mulig treff – bare beløp og dato",
 ambiguous:"Flere mulige banktransaksjoner – manuell kontroll",
 not_found:"Ingen tilsvarende banktransaksjon funnet",
 no_statement_coverage:"Mangler kontoutskrift for aktuell dato"
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
 useEffect(()=>{
  setAccess(null);setError("");setAccountId("");setMatch(null);
  setMatchFrom(minusDays(to,30)>from?minusDays(to,30):from);
  setMatchTo(to);
 },[unit,from,to]);
 const validRange=matchFrom>=from&&matchTo<=to&&matchFrom<=matchTo&&
  Number.isFinite(Date.parse(matchFrom))&&Number.isFinite(Date.parse(matchTo))&&
  (Date.parse(matchTo)-Date.parse(matchFrom))/86400000<31;
 async function checkAccess(){
  if(checking||unit!=="service")return;
  setChecking(true);setError("");setAccess(null);setMatch(null);
  try{
   const response=await fetch("/api/admin/tripletex/vipps-bank-match?mode=accounts",{
    cache:"no-store"
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Kunne ikke lese Tripletex-banktilgang.");
   setAccess(data);
   if(data.bankReadAccess&&data.bankAccounts?.length===1)
    setAccountId(String(data.bankAccounts[0].id));
  }catch(e){setError(e.message||"Banktilgangen kunne ikke kontrolleres.");}
  finally{setChecking(false);}
 }
 async function checkMatches(){
  if(checking||!access?.bankReadAccess||!accountId||!validRange)return;
  setChecking(true);setError("");setMatch(null);
  try{
   const q=new URLSearchParams({
    mode:"match",accountId,from:matchFrom,to:matchTo
   });
   const response=await fetch("/api/admin/tripletex/vipps-bank-match?"+q,{
    cache:"no-store"
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)
    throw Error(data.error||"Banktransaksjonene kunne ikke kontrolleres.");
   setMatch(data);
  }catch(e){setError(e.message||"Bankmatch mislyktes.");}
  finally{setChecking(false);}
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
   <button type="button" disabled={checking} onClick={checkAccess}
    className={styles.primary}>
    {checking?"Kontrollerer …":"Kontroller banktilgang i Tripletex"}
   </button>
   {access&&<div style={{marginTop:10}}>
    <p role="status" className={styles.hint}>
     {access.bankReadAccess?
      "Tripletex tillater lesing av kontoutskrifter via API. "+
       (access.hasStatementData?"Det finnes minst én kontoutskrift.":"Ingen kontoutskrift funnet i den første kontrollen."):
      access.reason}
    </p>
    {access.bankReadAccess&&access.bankAccounts?.length>0&&<>
     <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}>
      <label style={{display:"grid",gap:4,fontSize:13,flex:"1 1 220px"}}>
       Bankkonto hvor Vipps skal betale inn
       <select disabled={checking} value={accountId} onChange={e=>{
        setAccountId(e.target.value);setMatch(null);
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
     <button type="button" disabled={checking||!accountId||!validRange}
      onClick={checkMatches}>
      Finn mulige Vipps-innbetalinger i banken
     </button>
     {!validRange&&<p className={styles.hint}>
      Velg datoer innenfor den lagrede perioden, maks 31 dager.</p>}
    </>}
    {access.bankReadAccess&&!access.bankAccounts?.length&&
     <p className={styles.hint}>Ingen aktiv bankkonto funnet i Tripletex-kontoplanen.</p>}
   </div>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {match&&<div style={{marginTop:12}}>
    <strong>{match.payoutCount} Vipps-utbetalinger i perioden</strong>
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
