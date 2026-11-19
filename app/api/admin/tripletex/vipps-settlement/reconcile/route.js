import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {vippsRange,vippsSettlementSummary} from "../../../../../../lib/vippsSettlementReconcile";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead}
 from "../../../../../../lib/tripletexApi";
import {tripletexOpenBalance,vippsReconciliationOverview}
 from "../../../../../../lib/vippsReadOnlyReconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const nextDay=day=>new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);
const yesterday=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date(Date.now()-86400000));
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const allRows=(response,max=1000)=>Array.isArray(response?.values)&&
 response.values.length<max&&
 !(Number.isFinite(Number(response.fullResultSize))&&
  Number(response.fullResultSize)>=max);

// This endpoint is GET-only. It never changes Tripletex, Vipps or local account entries.
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eier kan kontrollere Vipps-reskontro."},403);
 const p=new URL(req.url).searchParams;
 const unit=p.get("unit"),from=p.get("from"),to=p.get("to");
 const days=vippsRange(from,to,366);
 if(unit!=="service")return json({
  error:"Denne avstemmingen gjelder Aadland Service. Aadland Utleie har separat oppgjør og må avstemmes for seg."},400);
 if(!days||to>yesterday())
  return json({error:"Velg en avsluttet Vipps-periode på maksimalt ett år."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const [stored,feeClaims,payoutClaims,connection]=await Promise.all([
   s.from("vipps_report_daily_cache")
    .select("report_date,ledger_id,funds,fees").eq("unit",unit)
    .gte("report_date",from).lte("report_date",to)
    .order("report_date").limit(367),
   s.from("tripletex_vipps_fee_transfers")
    .select("fee_psp_reference,ledger_date,amount_ore,status,tripletex_voucher_id")
    .eq("environment","production").eq("unit",unit)
    .gte("ledger_date",from).lte("ledger_date",to).limit(1001),
   s.from("tripletex_vipps_settlement_transfers")
    .select("payout_psp_reference,payout_date,payout_ore,status,tripletex_voucher_id")
    .eq("environment","production").eq("unit",unit)
    .gte("payout_date",from).lte("payout_date",to).limit(1001),
   storedTripletexConnection(s)
  ]);
  if(stored.error||feeClaims.error||payoutClaims.error||
   !Array.isArray(stored.data)||stored.data.length>366||
   !Array.isArray(feeClaims.data)||feeClaims.data.length>=1001||
   !Array.isArray(payoutClaims.data)||payoutClaims.data.length>=1001)
   throw Error("Avstemmingsgrunnlaget er ikke fullstendig. Ingen poster er endret.");
  if(!connection||connection.environment!=="production")
   throw Error("Tripletex produksjon må være tilkoblet før saldokontroll.");
  const cache=stored.data;
  if(!cache.length)throw Error("Ingen Vipps-rapporter er lagret. Hent perioden først.");
  if(new Set(cache.map(x=>x.ledger_id)).size!==1||
   cache.some(x=>!Array.isArray(x.funds)||!Array.isArray(x.fees)))
   throw Error("Vipps har flere oppgjørskontoer eller ufullstendig lagring.");
  const present=new Set(cache.map(x=>x.report_date));
  if(present.size!==cache.length)throw Error("Vipps-rapportdagene er ikke entydige.");
  const complete=days.every(day=>present.has(day));
  const funds=cache.flatMap(x=>x.funds);
  const fees=cache.flatMap(x=>x.fees);
  const report=vippsSettlementSummary(funds,fees);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  const [customerData,accountData]=await Promise.all([
   tripletexRead("/customer?customerAccountNumber=10009&count=10&fields=id,name,customerNumber",
    session,connection.environment),
   tripletexRead("/ledger/account?count=1000&fields=id,number,ledgerType,isInactive",
    session,connection.environment)
  ]);
  if(!allRows(customerData,10)||!allRows(accountData))
   throw Error("Tripletex-kunden eller kontoplanen kunne ikke leses fullstendig.");
  const customer=customerData.values;
  if(customer.length!==1||!validId(customer[0].id)||
   Number(customer[0].customerNumber)!==10009||
   !/vipps/i.test(String(customer[0].name||"")))
   throw Error("Kunde 10009 er ikke entydig bekreftet som Vipps oppgjørskunde.");
  const account=accountData.values.filter(a=>Number(a.number)===1500&&
   a.ledgerType==="CUSTOMER"&&!a.isInactive);
  if(account.length!==1||!validId(account[0].id))
   throw Error("Kundereskontro 1500 kunne ikke bekreftes i Tripletex.");
  // Tripletex 'date' is exclusive. Compare the exact end-of-day snapshot.
  const asOf=nextDay(to);
  const postings=await tripletexRead("/ledger/posting/openPost?date="+asOf+
   "&accountId="+account[0].id+"&customerId="+customer[0].id+
   "&sorted=false&count=1000&fields=id,date,description,amountGross,account,customer,voucher",
   session,connection.environment);
  if(!allRows(postings))
   throw Error("Tripletex returnerte for mange åpne poster for en sikker kontroll.");
  const open=tripletexOpenBalance(postings.values,account[0].id,customer[0].id,to);
  const claimFees=feeClaims.data.map(x=>({
   date:x.ledger_date,pspReference:x.fee_psp_reference,
   amount_ore:x.amount_ore,status:x.status,
   tripletex_voucher_id:x.tripletex_voucher_id
  }));
  const claimPayouts=payoutClaims.data.map(x=>({
   date:x.payout_date,pspReference:x.payout_psp_reference,
   payout_ore:x.payout_ore,status:x.status,
   tripletex_voucher_id:x.tripletex_voucher_id
  }));
  const overview=vippsReconciliationOverview({
   funds,fees:claimFees,payouts:claimPayouts,
   balanceOre:open.balanceOre,complete,unknownEntryTypes:report.unknownEntryTypes
  });
  // A transfer claim is an audit record. Its voucher ID may no longer appear
  // among OPEN postings if it has been closed; absence does not imply deletion.
  return json({ok:true,unit,from,to,checkedAt:new Date().toISOString(),
   customerNumber:10009,accountNumber:1500,reportDays:cache.length,
   totalDays:days.length,openPostingCount:open.rows.length,
   openPostings:open.rows.slice(0,100),openPostingsTruncated:open.rows.length>100,
   ...overview});
 }catch(error){
  return json({error:String(error?.message||"Kunne ikke avstemme Tripletex og Vipps.").slice(0,300)},503);
 }
}
