import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead}
 from "../../../../../lib/tripletexApi";
import {vippsRange} from "../../../../../lib/vippsSettlementReconcile";
import {bankMatchDateSpan,normalizeBankStatementTransactions,vippsBankCandidates,
 bankStatementCoverage}
 from "../../../../../lib/vippsTripletexBankMatch";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const idOk=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const dateOk=x=>typeof x==="string"&&/^20\d\d-\d\d-\d\d$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
const move=(day,delta)=>new Date(Date.parse(day+"T00:00:00Z")+
 delta*86400000).toISOString().slice(0,10);
const localYesterday=()=>{
 const d=new Date(Date.now()-86400000);
 return new Intl.DateTimeFormat("en-CA",{
  year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Oslo"
 }).format(d);
};
const completeList=(res,max)=>Array.isArray(res?.values)&&
 res.values.length<max&&
 !(typeof res?.fullResultSize==="number"&&res.fullResultSize>res.values.length);
const bankAccounts=values=>values.filter(a=>idOk(a.id)&&
 Number(a.number)>=1900&&Number(a.number)<2000&&
 a.ledgerType==="GENERAL"&&a.isBankAccount===true&&!a.isInactive)
 .map(a=>({id:Number(a.id),number:Number(a.number),
  name:String(a.name||"").slice(0,90)}));

export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")
  return json({error:"Kun eier kan kontrollere banktransaksjoner."},403);
 const q=new URL(req.url).searchParams;
 const mode=q.get("mode");
 if(!["accounts","match"].includes(mode))
  return json({error:"Velg banktilgang eller bankmatch."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const conn=await storedTripletexConnection(s);
  if(!conn||conn.environment!=="production")
   return json({error:"Tripletex produksjon er ikke tilkoblet."},409);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(conn),conn.environment);
  const accountResponse=await tripletexRead("/ledger/account?count=1000",session,conn.environment);
  if(!completeList(accountResponse,1000))
   throw Error("Tripletex returnerte ikke en komplett bankkontoliste.");
  const accounts=bankAccounts(accountResponse.values);
  if(mode==="accounts"){
   if(!accounts.length)return json({ok:true,bankReadAccess:false,
    bankAccounts:[],hasStatementData:false,
    reason:"Ingen aktiv bankkonto er merket som bankkonto i Tripletex. Kontroller kontoplanen."});
   const selectedId=q.get("accountId");
   const selected=selectedId===null?accounts[0]:
    accounts.find(a=>String(a.id)===selectedId);
   if(!selected)return json({error:"Bankkontoen kan ikke kontrolleres med dette Tripletex-oppsettet."},400);
   try{
    // Probe the selected trusted account, never infer rights for other bank
    // accounts from one successful statement request.
    const statements=await tripletexRead("/bank/statement?accountId="+
     selected.id+"&count=1",session,conn.environment);
    if(!Array.isArray(statements?.values))
     throw Error("Kontoutskriftstjenesten returnerte uventede data.");
    let transactionReadAccess=null;
    if(statements.values.length){
     const statementId=Number(statements.values[0]?.id);
     if(!idOk(statementId))throw Error("Kontoutskriften mangler gyldig ID.");
     try{
      const bankRows=await tripletexRead(
       "/bank/statement/transaction?bankStatementId="+statementId+
       "&count=1",session,conn.environment);
      transactionReadAccess=Array.isArray(bankRows?.values);
     }catch{transactionReadAccess=false;}
    }
    return json({ok:true,checkedAccountId:selected.id,
     bankReadAccess:transactionReadAccess!==false,
     transactionReadAccess,bankAccounts:accounts,
     hasStatementData:statements.values.length>0,
     reason:transactionReadAccess===false?
      "Kontoutskriften kan leses, men banktransaksjonene er ikke tilgjengelige med denne Tripletex-nøkkelen.":
      undefined,
     note:"Dette sjekker lesetilgang, ikke om banken har sendt oppdaterte kontoutskrifter."});
   }catch(error){
    const denied=[401,403,404].includes(Number(error?.status));
    return json({ok:true,bankReadAccess:false,checkedAccountId:selected.id,bankAccounts:accounts,
     reason:denied?"Tripletex-tilgangen gir ikke lesbare kontoutskrifter. Kontroller API-rettigheter og bankintegrasjon.":
      "Kontoutskrifter kunne ikke leses fra Tripletex. Det er ikke bekreftet om bankdata er tilgjengelige."});
   }
  }
  const from=q.get("from"),to=q.get("to"),accountId=Number(q.get("accountId"));
  if(!bankMatchDateSpan(from,to)||to>localYesterday()||!idOk(accountId))
   return json({error:"Velg en gyldig bankkonto og maksimalt 31 avsluttede dager."},400);
  const account=accounts.find(a=>a.id===accountId);
  if(!account)return json({error:"Bankkontoen er ikke aktiv eller godkjent i Tripletex."},409);
  const days=vippsRange(from,to,31);
  if(!days)return json({error:"Ugyldig Vipps-periode."},400);
  const [saved,transfers,statementResponse]=await Promise.all([
   s.from("vipps_report_daily_cache").select("report_date,ledger_id,funds")
    .eq("unit","service").gte("report_date",from).lte("report_date",to)
    .order("report_date").limit(32),
   s.from("tripletex_vipps_settlement_transfers")
    .select("payout_date,payout_psp_reference,status,payout_ore")
    .eq("environment","production").eq("unit","service")
    .gte("payout_date",from).lte("payout_date",to).limit(1001),
   tripletexRead("/bank/statement?accountId="+accountId+"&count=1000",
    session,conn.environment)
  ]);
  if(saved.error||transfers.error||!Array.isArray(saved.data)||
   !Array.isArray(transfers.data)||transfers.data.length>=1001||
   !completeList(statementResponse,1000))
   throw Error("Vipps- eller Tripletex-dataene kunne ikke leses komplett. Ingen match er markert.");
  const stored=saved.data;
  if(stored.length!==days.length||stored.some((row,i)=>
   row.report_date!==days[i]||!Array.isArray(row.funds))||
   new Set(stored.map(x=>x.ledger_id)).size!==1)
   return json({error:"Vipps har manglende eller ufullstendige dagsrapporter. Hent dem først."},409);
  const claims=new Map(transfers.data.map(x=>[
   x.payout_date+"|"+x.payout_psp_reference,x]));
  const payouts=stored.flatMap(x=>x.funds)
   .filter(x=>x.type==="payout-scheduled")
   .map(x=>({date:x.date,pspReference:x.pspReference,
    amountOre:-x.amountOre,
    transferStatus:claims.get(x.date+"|"+x.pspReference)?.status||"not_transferred"}));
  if(!payouts.length)return json({ok:true,bankAccount:account,from,to,
   payoutCount:0,matches:[],bankStatementsRead:0,
   note:"Ingen planlagte Vipps-utbetalinger i valgt periode. Ingen bankmatch nødvendig."});
  const windowFrom=move(from,-1),windowTo=move(to,8);
  const allStatements=statementResponse.values;
  // Statement dates are necessary to distinguish "not found" from no bank coverage.
  if(allStatements.some(x=>!idOk(x?.id)||
   ((x.accountId??x.account?.id)!=null&&
    Number(x.accountId??x.account?.id)!==accountId)||
   !dateOk(x.fromDate)||!dateOk(x.toDate)||x.fromDate>=x.toDate))
   throw Error("Tripletex returnerte kontoutskrifter med ukjent konto eller dato. Ingen sikker bankmatch.");
  const relevant=allStatements.filter(x=>
   x.fromDate<=windowTo&&x.toDate>windowFrom);
  if(relevant.length>8)
   throw Error("For mange bankutskrifter for valgt periode. Bruk kortere datointervall.");
  const pages=await Promise.all(relevant.map(async statement=>{
   const res=await tripletexRead("/bank/statement/transaction?bankStatementId="+
    Number(statement.id)+"&count=1000",session,conn.environment);
   if(!completeList(res,1000))
    throw Error("Tripletex har for mange transaksjoner til at bankavstemmingen kan kontrolleres komplett.");
   return res.values.map(x=>({
    ...x,bankStatement:x.bankStatement||{id:Number(statement.id)}
   }));
  }));
  const allTransactions=normalizeBankStatementTransactions(relevant,
   pages.flat(),accountId);
  const matches=vippsBankCandidates(payouts,allTransactions,{from,to})
   .map(m=>{
    const coverage=bankStatementCoverage(relevant,move(m.date,-1),move(m.date,8));
    const status=m.status!=="not_found"?m.status:
     coverage==="complete"?"not_found":
     coverage==="partial"?"partial_statement_coverage":"no_statement_coverage";
    return {...m,status,statementCoverage:coverage};
   });
  return json({ok:true,bankAccount:account,from,to,payoutCount:matches.length,
   bankStatementsRead:relevant.length,matches,
   disclaimer:"Dette er kun forslag fra bankutskrifter. Et beløps- og datotreff er IKKE en bekreftet eller avstemt innbetaling. Ingen bilag opprettes, bankposteringer matches ikke og ingen bekreftelsesbokser krysses av automatisk."});
 }catch(error){
  const message=Number(error?.status)===403?
   "Tripletex-nøkkelen mangler tilgang til bankutskrifter. Kontroller rettighetene i Tripletex.":
   String(error?.message||"Kunne ikke undersøke banktransaksjonene.");
  return json({error:message.slice(0,300)},503);
 }
}
