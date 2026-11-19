import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../../lib/vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries} from "../../../../../lib/vippsClient";
import {matchingLedger,normalizeReportEntries,vippsRange} from "../../../../../lib/vippsSettlementReconcile";
import {vippsFeeMarker,retainedVippsFeePlan,tripletexRetainedFeeVoucher}
 from "../../../../../lib/vippsTripletexFeePlan";
import {acquireVippsAccountingLock,releaseVippsAccountingLock}
 from "../../../../../lib/vippsTripletexWriteLock";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexCreateVippsSettlementVoucher}
 from "../../../../../lib/tripletexApi";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const sha=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const nextDate=day=>new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);
const localYesterday=()=>{
 const date=new Date(Date.now()-86400000);
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
};
const valid=(day,feeId)=>vippsRange(day,day,1)!==null&&
 typeof feeId==="string"&&/^[A-Za-z0-9_-]{4,100}$/.test(feeId);

async function checkRemoteDuplicate(session,env,day,marker){
 const r=await tripletexRead("/ledger/voucher?dateFrom="+day+
  "&dateTo="+nextDate(day)+"&count=1000",session,env);
 if(!Array.isArray(r?.values)||r.values.length>=1000)
  throw Error("Bilagslisten i Tripletex er ufullstendig. Kan ikke kontrollere dobbeltføring.");
 if(r.values.some(x=>String(x?.description||"").includes(marker)))
  throw Error("Gebyrbilaget finnes allerede i Tripletex. Ikke før det på nytt.");
}

async function prepare(s,day,feeId){
 if(day>localYesterday())throw Error("Gebyrdagen må være avsluttet i Vipps.");
 const config=vippsUnitConfig("service");
 if(!config.configured||config.environment!=="production")
  throw Error("Vipps Report API må være koblet til produksjon.");
 const connection=await storedTripletexConnection(s);
 if(!connection||connection.environment!=="production")
  throw Error("Tripletex må være koblet til produksjon.");
 const ledgers=await vippsSettlementLedgers("service");
 const ledger=matchingLedger(ledgers,config.values.msn);
 if(!ledger.ok)throw Error(ledger.reason);
 const [rawFunds,rawFees]=await Promise.all([
  vippsSettlementEntries("service",ledger.ledgerId,"funds",day),
  vippsSettlementEntries("service",ledger.ledgerId,"fees",day)
 ]);
 const funds=normalizeReportEntries(rawFunds,"funds");
 const fees=normalizeReportEntries(rawFees,"fees");
 const plan=retainedVippsFeePlan(funds,fees,feeId,day);
 const [old,priorPayouts]=await Promise.all([
  s.from("tripletex_vipps_fee_transfers")
   .select("status,tripletex_voucher_id").eq("environment","production")
   .eq("unit","service").eq("ledger_id",ledger.ledgerId)
   .eq("fee_psp_reference",feeId).maybeSingle(),
  s.from("tripletex_vipps_settlement_transfers").select("payout_date,status")
   .eq("environment","production").eq("unit","service")
   .gte("payout_date",day).limit(1001)
 ]);
 if(old.error||priorPayouts.error||(priorPayouts.data||[]).length>1000)
  throw Error("Tidligere Tripletex-overføringer kunne ikke kontrolleres.");
 // A prior voucher for a later payout might already include this fee.
 // Fail closed rather than inserting the same fee a second time.
 if((priorPayouts.data||[]).some(x=>["processing","confirmed","needs_review"].includes(x.status)))
  throw Error("Et senere Vipps-oppgjør er allerede overført eller under kontroll. "+
   "Gebyrdatoen må avstemmes manuelt for å unngå dobbeltføring.");
 const session=await tripletexOpenSession(
  unprotectTripletexToken(connection),connection.environment);
 const [accounts,customers]=await Promise.all([
  tripletexRead("/ledger/account?count=1000",session,connection.environment),
  tripletexRead("/customer?customerAccountNumber=10009&count=10",session,connection.environment)
 ]);
 if(!Array.isArray(accounts?.values)||accounts.values.length>=1000||
  !Array.isArray(customers?.values)||customers.values.length!==1)
  throw Error("Kontoplan eller Vipps oppgjørskunde kunne ikke leses fra Tripletex.");
 const customer=customers.values[0];
 if(!positive(customer.id)||Number(customer.customerAccountNumber)!==10009||
  !/vipps/i.test(String(customer.name||"")))
  throw Error("Kunden 10009 er ikke bekreftet som Vipps oppgjørskunde.");
 const active=accounts.values.filter(x=>positive(x.id)&&!x.isInactive);
 const customerAccounts=active.filter(a=>Number(a.number)===1500&&
  a.ledgerType==="CUSTOMER");
 const feeAccounts=active.filter(a=>Number(a.number)===7770&&
  a.ledgerType==="GENERAL");
 if(customerAccounts.length!==1||!feeAccounts.length)
  throw Error("Krever kundereskontro 1500 og gebyrkonto 7770 i Tripletex.");
 const marker=vippsFeeMarker("service",feeId);
 if(!old.data)await checkRemoteDuplicate(session,connection.environment,day,marker);
 return {
  plan,ledgerId:ledger.ledgerId,session,connection,marker,
  old:old.data||null,
  digest:sha({ledgerId:ledger.ledgerId,day,feeId,amountOre:plan.amountOre,
   customerId:Number(customer.id),customerAccountId:Number(customerAccounts[0].id)}),
  customer:{id:Number(customer.id),number:10009,name:customer.name},
  customerAccountId:Number(customerAccounts[0].id),
  feeAccounts:feeAccounts.map(a=>({id:Number(a.id),number:a.number,name:a.name}))
 };
}

export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere Vipps-gebyrer."},403);
 const params=new URL(req.url).searchParams;
 const day=params.get("date"),feeId=params.get("feeId");
 if(params.get("unit")!=="service"||!valid(day,feeId))
  return json({error:"Velg et gyldig trukket Vipps-gebyr."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const x=await prepare(s,day,feeId);
  return json({
   ok:true,ready:!x.old,plan:x.plan,digest:x.digest,previous:x.old,
   customer:x.customer,feeAccounts:x.feeAccounts,
   note:"Dette bilaget registrerer kun gebyret trukket fra Vipps. "+
    "Ingen bankutbetaling opprettes. Salget er allerede bokført fra faktura."
  });
 }catch(error){
  return json({error:error?.message||"Kunne ikke kontrollere Vipps-gebyret."},409);
 }
}

export async function POST(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan bokføre Vipps-gebyrer."},403);
 const body=await req.json().catch(()=>({}));
 const {date,feeId,expectedDigest,feeAccountId}=body;
 if(body.action!=="record-retained-fee"||body.unit!=="service"||
  body.confirmed!==true||body.notImportedPreviously!==true||
  !valid(date,feeId)||!positive(feeAccountId)||
  typeof expectedDigest!=="string"||!/^[a-f0-9]{64}$/.test(expectedDigest))
  return json({error:"Kontroller gebyrkontoen og bekreft at gebyret ikke er bokført fra før."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let lock=null,writeStarted=false,claimed=false;
 try{
  lock=await acquireVippsAccountingLock(s,"production","service");
  // Re-fetch Vipps and Tripletex AFTER the exclusive lock, never trust the
  // browser's amount or a stale preflight made before another posting.
  const x=await prepare(s,date,feeId);
  if(x.old)return json({error:"Dette gebyret er allerede bokført eller må kontrolleres. Ikke send på nytt."},409);
  if(x.digest!==expectedDigest)return json({error:"Vipps-gebyret er endret. Oppdater kontrollen og prøv igjen."},409);
  const fee=x.feeAccounts.find(a=>a.id===Number(feeAccountId));
  if(!fee)return json({error:"Valgt gebyrkonto er ikke gyldig i Tripletex."},409);
  const voucher=tripletexRetainedFeeVoucher(x.plan,{
   unit:"service",customerId:x.customer.id,
   customerAccountId:x.customerAccountId,feeAccountId:fee.id
  });
  const insert=await s.from("tripletex_vipps_fee_transfers").insert({
   environment:"production",unit:"service",ledger_id:x.ledgerId,
   fee_psp_reference:feeId,ledger_date:date,amount_ore:x.plan.amountOre,
   fee_entry_digest:x.digest,status:"processing",customer_id:x.customer.id,
   customer_account_id:x.customerAccountId,fee_account_id:fee.id
  });
  if(insert.error)return json({error:"Gebyret er allerede reservert eller bokført. Ingen ny overføring."},409);
  claimed=true;
  await checkRemoteDuplicate(x.session,x.connection.environment,date,x.marker);
  writeStarted=true;
  const voucherId=await tripletexCreateVippsSettlementVoucher(
   voucher,x.session,x.connection.environment);
  const remote=await tripletexRead("/ledger/voucher/"+voucherId,
   x.session,x.connection.environment);
  if(Number(remote?.value?.id)!==voucherId||
   !String(remote?.value?.description||"").includes(x.marker))
   throw Error("Tripletex kunne ikke bekrefte gebyrbilaget.");
  const updated=await s.from("tripletex_vipps_fee_transfers")
   .update({status:"confirmed",tripletex_voucher_id:voucherId,
    confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    error_code:null})
   .eq("environment","production").eq("unit","service")
   .eq("ledger_id",x.ledgerId).eq("fee_psp_reference",feeId)
   .eq("status","processing").select("tripletex_voucher_id").maybeSingle();
  if(updated.error||!updated.data)
   throw Error("Gebyret kan være bokført, men overføringsloggen ble ikke lagret.");
  claimed=false;writeStarted=false;
  return json({ok:true,voucherId,amountOre:x.plan.amountOre,
   message:"Vipps-gebyret er bokført uten bankinnbetaling. Kontroller reskontro mot Vipps."});
 }catch(error){
  if(claimed){
   await s.from("tripletex_vipps_fee_transfers").update({
    status:"needs_review",error_code:writeStarted?"remote_outcome_unknown":"preflight_failed",
    updated_at:new Date().toISOString()
   }).eq("environment","production").eq("unit","service")
    .eq("fee_psp_reference",feeId).eq("status","processing");
  }
  return json({error:claimed?
   "Gebyrbilaget kan allerede være sendt til Tripletex. Ikke prøv igjen før regnskapet er kontrollert.":
   error?.message||"Kunne ikke overføre Vipps-gebyret."},claimed?409:503);
 }finally{
  // Keep the cross-workflow lock when Tripletex may have accepted a write
  // that we could not definitively confirm.
  if(lock&&!writeStarted)
   await releaseVippsAccountingLock(s,"production","service",lock).catch(()=>null);
 }
}
