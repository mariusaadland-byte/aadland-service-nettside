import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {db} from "../../../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../../../lib/vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries}
 from "../../../../../../lib/vippsClient";
import {vippsRange,matchingLedger,normalizeReportEntries,
 vippsSettlementSummary} from "../../../../../../lib/vippsSettlementReconcile";
import {cacheDaysToSync,cacheDailyComparison} from "../../../../../../lib/vippsReportCache";
import {storedTripletexConnection} from "../../../../../../lib/tripletexCredentials";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const validUnit=unit=>["service","rental"].includes(unit);
const localDay=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date(Date.now()-86400000));
const stamp=()=>new Date().toISOString();
const fingerprint=(funds,fees)=>crypto.createHash("sha256")
 .update(JSON.stringify({funds,fees})).digest("hex");
const dateOf=row=>row.report_date;
const maxStoredDays=366;

async function loadCached(s,unit,days){
 const result=await s.from("vipps_report_daily_cache")
  .select("unit,ledger_id,report_date,funds,fees,fingerprint,checked_at,schema_version")
  .eq("unit",unit).gte("report_date",days[0])
  .lte("report_date",days.at(-1)).order("report_date")
  .limit(maxStoredDays+1);
 if(result.error||!Array.isArray(result.data)||result.data.length>maxStoredDays)
  throw Error("Kunne ikke lese lagrede Vipps-rapporter.");
 const rows=result.data;
 if(new Set(rows.map(x=>x.ledger_id)).size>1)
  throw Error("Det finnes rapporter fra ulike Vipps-oppgjørskontoer. Manuell kontroll kreves.");
 if(rows.some(row=>row.schema_version!==1||!Array.isArray(row.funds)||
  !Array.isArray(row.fees)||
  !row.funds.every(x=>x.topic==="funds"&&x.date===dateOf(row))||
  !row.fees.every(x=>x.topic==="fees"&&x.date===dateOf(row))))
  throw Error("En lagret Vipps-rapport har ugyldig format. Kontroller grunnlaget.");
 return rows;
}
async function localMatches(s){
 const [payments,invoiceVipps,transfers,connection]=await Promise.all([
  s.from("invoice_payments").select(
   "id,vipps_reference,amount_ore,reversed_at").not("vipps_reference","is",null).limit(2001),
  s.from("invoice_vipps_payments").select(
   "reference,captured_ore,refunded_ore,state").limit(2001),
  s.from("tripletex_payment_transfers").select(
   "payment_id,status,amount_ore").limit(2001),
  storedTripletexConnection(s)
 ]);
 if([payments,invoiceVipps,transfers].some(x=>x.error||
  !Array.isArray(x.data)||x.data.length>2000))
  throw Error("Den lokale betalingshistorikken er for stor eller ufullstendig.");
 const rows=(payments.data||[]).filter(x=>x.vipps_reference)
  .map(x=>({reference:x.vipps_reference,paymentId:x.id,
   amountOre:Number(x.amount_ore),reversed:!!x.reversed_at}));
 const existing=new Set(rows.map(x=>x.reference));
 for(const p of invoiceVipps.data||[]){
  if(!p.reference||existing.has(p.reference)||
   !["paid","captured"].includes(p.state)||Number(p.refunded_ore||0)>0)
   continue;
  rows.push({reference:p.reference,paymentId:null,
   amountOre:Number(p.captured_ore),reversed:false});
 }
 return {rows,transfers:transfers.data||[],tripletexConnected:!!connection};
}
async function transferStatuses(s,unit,from,to,ledgerId){
 const [payouts,fees]=await Promise.all([
  s.from("tripletex_vipps_settlement_transfers")
   .select("payout_psp_reference,payout_date,status,payout_ore")
   .eq("unit",unit).eq("environment","production")
   .gte("payout_date",from).lte("payout_date",to).limit(2001),
  s.from("tripletex_vipps_fee_transfers")
   .select("fee_psp_reference,ledger_date,status,amount_ore")
   .eq("unit",unit).eq("environment","production").eq("ledger_id",ledgerId)
   .gte("ledger_date",from).lte("ledger_date",to).limit(2001)
 ]);
 if([payouts,fees].some(x=>x.error||!Array.isArray(x.data)||x.data.length>2000))
  throw Error("Tripletex-overføringsstatus kunne ikke hentes fullstendig.");
 return {
  payouts:new Map(payouts.data.map(x=>[x.payout_date+"|"+x.payout_psp_reference,x])),
  fees:new Map(fees.data.map(x=>[x.ledger_date+"|"+x.fee_psp_reference,x]))
 };
}

export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")
  return json({error:"Bare eier kan se lagrede Vipps-oppgjør."},403);
 const p=new URL(req.url).searchParams;
 const unit=p.get("unit"),from=p.get("from"),to=p.get("to");
 const days=vippsRange(from,to,maxStoredDays);
 if(!validUnit(unit)||!days||days.at(-1)>localDay())
  return json({error:"Velg et salgssted og en avsluttet periode på maksimalt 366 dager."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const cached=await loadCached(s,unit,days);
  const available=new Set(cached.map(dateOf));
  const missingDays=days.filter(day=>!available.has(day));
  const toSync=cacheDaysToSync(days,cached,localDay(),stamp());
  const lastCheckedAt=cached.reduce((latest,x)=>
   !latest||x.checked_at>latest?x.checked_at:latest,null);
  let result=null;
  if(cached.length){
   const [local,statuses]=await Promise.all([
    localMatches(s),transferStatuses(s,unit,from,to,cached[0].ledger_id)
   ]);
   const funds=cached.flatMap(x=>x.funds),fees=cached.flatMap(x=>x.fees);
   const report=vippsSettlementSummary(funds,fees,local.rows,local.transfers);
   const payoutRows=report.payoutRows.map(x=>{
    const t=statuses.payouts.get(x.date+"|"+x.pspReference);
    return {...x,tripletexStatus:t?.status||"not_transferred",
     transferMismatch:!!t&&Number(t.payout_ore)!==x.amountOre};
   });
   const feeRows=report.feeRows.map(x=>{
    const t=statuses.fees.get(x.date+"|"+x.pspReference);
    return {...x,tripletexStatus:t?.status||"not_transferred",
     transferMismatch:!!t&&Number(t.amount_ore)!==x.amountOre};
   });
   result={...report,payoutRows,feeRows,tripletexConnected:local.tripletexConnected};
  }
  return json({
   ok:true,unit,from,to,source:"stored",
   storedDays:cached.length,totalDays:days.length,
   missingDays,checkDays:toSync,
   complete:missingDays.length===0,
   lastCheckedAt,result,
   transferCounts:result?{
    payoutsConfirmed:result.payoutRows.filter(x=>x.tripletexStatus==="confirmed"&&!x.transferMismatch).length,
    payoutsNotTransferred:result.payoutRows.filter(x=>x.tripletexStatus==="not_transferred").length,
    payoutsToReview:result.payoutRows.filter(x=>x.transferMismatch||["needs_review","processing"].includes(x.tripletexStatus)).length,
    feesConfirmed:result.feeRows.filter(x=>x.tripletexStatus==="confirmed"&&!x.transferMismatch).length,
    feesNotTransferred:result.feeRows.filter(x=>x.tripletexStatus==="not_transferred").length,
    feesToReview:result.feeRows.filter(x=>x.transferMismatch||["needs_review","processing"].includes(x.tripletexStatus)).length
   }:null,
   message:missingDays.length?
    "Dette er en delvis lagret Vipps-oversikt. Manglende datoer må hentes før hele perioden er kontrollert.":
    "Hele den valgte perioden er lagret. Ny kontroll vil kun hente manglende og nylige datoer."
  });
 }catch(error){
  return json({error:error.message||"Kunne ikke lese lagrede Vipps-oppgjør."},503);
 }
}

export async function POST(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")
  return json({error:"Bare eier kan oppdatere Vipps-rapportene."},403);
 const body=await req.json().catch(()=>({}));
 const {unit,days}=body;
 if(body.action!=="check-new"||!validUnit(unit)||
  !Array.isArray(days)||days.length<1||days.length>7||
  days.some((d,i)=>vippsRange(d,d,1)===null||d>localDay()||
   (i>0&&days[i-1]>=d)))
  return json({error:"Kontroller maksimalt 7 avsluttede datoer av gangen."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const current=await s.from("vipps_report_daily_cache")
   .select("report_date,ledger_id,fingerprint,checked_at")
   .eq("unit",unit).in("report_date",days).limit(50);
  if(current.error||!Array.isArray(current.data)||current.data.length>days.length)
   throw Error("Kunne ikke kontrollere tidligere lagrede dager.");
  const existing=current.data;
  if(new Set(existing.map(x=>x.ledger_id)).size>1)
   throw Error("Flere Vipps-oppgjørskontoer er registrert for perioden.");
  const pending=cacheDaysToSync(days,existing,localDay(),stamp());
  if(!pending.length)
   return json({ok:true,checkedDays:0,newDays:0,changedDays:0,
    unchangedDays:0,skippedDays:days.length,
    message:"Alle datoene er allerede lagret og nylig kontrollert."});
  const config=vippsUnitConfig(unit);
  if(!config.configured||config.environment!=="production")
   throw Error("Vipps Report API er ikke konfigurert i produksjonsmiljø.");
  const ledgers=await vippsSettlementLedgers(unit);
  const match=matchingLedger(ledgers,config.values.msn);
  if(!match.ok)throw Error(match.reason);
  if(existing.some(x=>x.ledger_id!==match.ledgerId))
   throw Error("Vipps-salgsstedet peker på en annen oppgjørskonto enn den lagrede. Manuell kontroll kreves.");
  const fetched=[];
  for(let offset=0;offset<pending.length;offset+=2){
   const batch=pending.slice(offset,offset+2);
   const received=await Promise.all(batch.flatMap(day=>[
    vippsSettlementEntries(unit,match.ledgerId,"funds",day),
    vippsSettlementEntries(unit,match.ledgerId,"fees",day)
   ]));
   for(let i=0;i<batch.length;i++){
    const day=batch[i],funds=normalizeReportEntries(received[i*2],"funds"),
     fees=normalizeReportEntries(received[i*2+1],"fees");
    if(!funds.every(e=>e.date===day)||!fees.every(e=>e.date===day))
     throw Error("Vipps returnerte posteringer for en annen dato. Ingen rapporter er lagret.");
    fetched.push({unit,ledger_id:match.ledgerId,report_date:day,
     funds,fees,fingerprint:fingerprint(funds,fees),checked_at:stamp(),schema_version:1});
   }
  }
  // One atomic database request after every provider report succeeded. Never
  // merge incremental amounts; replace a changed DAY snapshot, so values
  // cannot accumulate twice when Vipps corrects a past settlement.
  const comparison=cacheDailyComparison(existing,fetched);
  const written=await s.from("vipps_report_daily_cache")
   .upsert(fetched,{onConflict:"unit,ledger_id,report_date"})
   .select("report_date");
  if(written.error||!Array.isArray(written.data)||written.data.length!==fetched.length)
   throw Error("Oppgjørsrapportene ble hentet, men lagring kunne ikke bekreftes. Kontroller igjen.");
  return json({ok:true,checkedDays:fetched.length,skippedDays:days.length-fetched.length,
   ...comparison,message:"Vipps er kontrollert og dagsrapportene er lagret uten regnskapsføring."});
 }catch(error){
  const message=error.code==="REPORT_NOT_READY"?
   "Vipps har ennå ikke ferdigstilt rapporten for alle valgte dager. Ingen ufullstendige delrapporter blir lagret.":
   error.code==="REPORT_NO_ACCESS"?error.message:
   String(error.message||"Vipps-rapportene kunne ikke kontrolleres.");
  return json({error:message.slice(0,280)},409);
 }
}
