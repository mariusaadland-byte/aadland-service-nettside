import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../../lib/vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries} from "../../../../../lib/vippsClient";
import {matchingLedger,normalizeReportEntries,vippsRange} from "../../../../../lib/vippsSettlementReconcile";
import {vippsPayoutPlan,payoutTripletexMarker,
 tripletexPayoutVoucher} from "../../../../../lib/vippsTripletexPayoutPlan";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,
 tripletexCreateVippsSettlementVoucher} from "../../../../../lib/tripletexApi";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tomorrow=day=>new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);
const backDays=(day,n)=>new Date(Date.parse(day+"T00:00:00Z")-n*86400000).toISOString().slice(0,10);

async function reviewVoucherDuplicate(session,environment,date,marker){
 const data=await tripletexRead("/ledger/voucher?dateFrom="+date+"&dateTo="+tomorrow(date)+
  "&count=1000",session,environment);
 if(!Array.isArray(data?.values)||data.values.length>=1000)
  throw Error("Bilagslisten i Tripletex er ufullstendig. Kan ikke kontrollere duplikater.");
 if(data.values.some(x=>String(x?.description||"").includes(marker)))
  throw Error("Oppgjøret finnes allerede som bilag i Tripletex. Ikke før på nytt.");
}
async function prepare(s,day,payoutId){
 const config=vippsUnitConfig("service");
 if(!config.configured||config.environment!=="production")
  throw Error("Vipps production Report API må være konfigurert for Aadland Service.");
 const conn=await storedTripletexConnection(s);
 if(!conn||conn.environment!=="production")
  throw Error("Koble til Tripletex produksjon før oppgjøret kan overføres.");
 const ledgers=await vippsSettlementLedgers("service");
 const match=matchingLedger(ledgers,config.values.msn);
 if(!match.ok)throw Error(match.reason);
 const days=vippsRange(backDays(day,6),day,7);
 if(!days)throw Error("Ugyldig dato for Vipps-oppgjør.");
 const funds=[];
 // Seven complete, ordered ledger dates. No inference from monthly totals.
 for(const date of days){
  const entries=await vippsSettlementEntries("service",match.ledgerId,"funds",date);
  funds.push(...normalizeReportEntries(entries,"funds"));
 }
 const [loc,paid]=await Promise.all([
  s.from("invoice_payments").select("id,vipps_reference,amount_ore,reversed_at")
   .not("vipps_reference","is",null).limit(2001),
  s.from("tripletex_payment_transfers").select("payment_id,status,amount_ore,payment_type_id")
   .limit(2001)
 ]);
 if(loc.error||paid.error||(loc.data||[]).length>2000||(paid.data||[]).length>2000)
  throw Error("Kunne ikke kontrollere fullstendig betalingshistorikk i Aadland Service.");
 const plan=vippsPayoutPlan(funds,payoutId,day,loc.data||[],paid.data||[]);
 const session=await tripletexOpenSession(unprotectTripletexToken(conn),conn.environment);
 const [accounts,customers,types]=await Promise.all([
  tripletexRead("/ledger/account?count=1000",session,conn.environment),
  tripletexRead("/customer?customerAccountNumber=10009&count=10",session,conn.environment),
  tripletexRead("/invoice/paymentType?count=1000",session,conn.environment)
 ]);
 if(!Array.isArray(accounts.values)||accounts.values.length>=1000||
  !Array.isArray(customers.values)||customers.values.length!==1||
  !Array.isArray(types.values)||types.values.length>=1000)
  throw Error("Tripletex-kontoene eller Vipps-oppgjørskunden kan ikke identifiseres sikkert.");
 const customer=customers.values[0];
 if(!positive(customer.id)||Number(customer.customerAccountNumber)!==10009||
  !/vipps/i.test(String(customer.name||"")))
  throw Error("Kunden 10009 er ikke bekreftet som Vipps oppgjørskunde.");
 const vippsTypes=types.values.filter(x=>/vipps/i.test(
  String(x.description||x.name||""))&&!x.isInactive);
 if(vippsTypes.length!==1||!positive(vippsTypes[0].id))
  throw Error("Fant ikke én entydig Vipps-betalingstype i Tripletex.");
 const vippsTypeId=Number(vippsTypes[0].id);
 const linkedPaymentIds=new Set(loc.data.filter(p=>p.vipps_reference&&p.reversed_at==null)
  .map(p=>p.id));
 const refs=new Set(funds.filter(x=>x.type==="capture").map(x=>x.reference));
 const relevant=loc.data.filter(p=>refs.has(p.vipps_reference)&&linkedPaymentIds.has(p.id));
 if(relevant.some(p=>{
  const rows=(paid.data||[]).filter(x=>x.payment_id===p.id&&x.status==="confirmed");
  return rows.length!==1||Number(rows[0].payment_type_id)!==vippsTypeId;
 }))
  throw Error("En Vipps-betaling ble overført med feil betalingstype i Tripletex. Ingen oppgjørsføring.");
 const candidates=accounts.values.filter(a=>positive(a.id)&&!a.isInactive);
 const customerAccounts=candidates.filter(a=>Number(a.number)===1500&&a.ledgerType==="CUSTOMER");
 const feeAccounts=candidates.filter(a=>Number(a.number)===7770&&a.ledgerType==="GENERAL");
 const banks=candidates.filter(a=>Number(a.number)>=1900&&Number(a.number)<2000&&
  a.ledgerType==="GENERAL"&&a.isBankAccount===true);
 if(customerAccounts.length!==1||!feeAccounts.length||!banks.length)
  throw Error("Kontroller kontoplanen i Tripletex: krever kundereskontro 1500, gebyrkonto 7770 og minst én bankkonto.");
 const marker=payoutTripletexMarker("service",payoutId);
 await reviewVoucherDuplicate(session,conn.environment,day,marker);
 const duplicate=await s.from("tripletex_vipps_settlement_transfers")
  .select("status,tripletex_voucher_id").eq("environment",conn.environment)
  .eq("unit","service").eq("payout_psp_reference",payoutId).maybeSingle();
 if(duplicate.error)throw Error("Kunne ikke sjekke tidligere Vipps-overføringer.");
 const digest=hash({unit:"service",payoutId,plan,
  customerId:Number(customer.id),typeId:vippsTypeId});
 return {plan,digest,marker,conn,session,
  customer:{id:Number(customer.id),name:customer.name,number:10009},
  customerAccount:customerAccounts[0],
  feeAccounts:feeAccounts.map(x=>({id:Number(x.id),number:x.number,name:x.name})),
  bankAccounts:banks.map(x=>({id:Number(x.id),number:x.number,name:x.name})),
  previous:duplicate.data||null};
}
function validParams(day,payoutId){
 return typeof payoutId==="string"&&/^[A-Za-z0-9_-]{4,100}$/.test(payoutId)&&
  typeof day==="string"&&vippsRange(day,day,1)!==null;
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan kontrollere Vipps-overføringer."},403);
 const p=new URL(req.url).searchParams,day=p.get("date"),payoutId=p.get("payoutId");
 if(p.get("unit")!=="service"||!validParams(day,payoutId))
  return json({error:"Velg en gyldig Vipps-utbetaling fra Aadland Service."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const x=await prepare(s,day,payoutId);
  return json({ok:true,ready:!x.previous,plan:x.plan,digest:x.digest,
   previous:x.previous,customer:x.customer,
   customerAccount:{id:x.customerAccount.id,number:x.customerAccount.number,
    name:x.customerAccount.name},
   feeAccounts:x.feeAccounts,bankAccounts:x.bankAccounts,
   note:"Kontroller bankutbetalingen og at oppgjøret ikke tidligere er importert. "+
    "Bilaget vil føre bank, Vipps-gebyr og Vipps oppgjørskunde 10009. "+
    "Åpne poster må deretter lukkes i kundereskontroen."});
 }catch(error){return json({ok:false,ready:false,
  error:error.message||"Kunne ikke avstemme Vipps-utbetalingen."},409);}
}
export async function POST(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan overføre Vipps-oppgjør."},403);
 const body=await req.json().catch(()=>({}));
 const {date,payoutId,bankAccountId,feeAccountId,expectedDigest}=body;
 if(body.action!=="transfer"||body.unit!=="service"||body.confirmed!==true||
  body.bankReceived!==true||body.notImportedPreviously!==true||
  !validParams(date,payoutId)||!positive(bankAccountId)||!positive(feeAccountId)||
  typeof expectedDigest!=="string"||!/^[a-f0-9]{64}$/.test(expectedDigest))
  return json({error:"Kontroller bankinnbetaling, kontoer og at oppgjøret ikke er importert før."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false,writeStarted=false;
 try{
  const x=await prepare(s,date,payoutId);
  if(x.previous)return json({error:"Dette Vipps-oppgjøret er allerede overført eller under kontroll. Ikke send på nytt."},409);
  if(expectedDigest!==x.digest)return json({error:"Oppgjøret er endret siden kontrollen. Oppdater og kontroller igjen."},409);
  const bank=x.bankAccounts.find(a=>a.id===Number(bankAccountId));
  const fee=x.feeAccounts.find(a=>a.id===Number(feeAccountId));
  if(!bank||!fee)return json({error:"Valgte kontoer stemmer ikke med Tripletex."},409);
  const voucher=tripletexPayoutVoucher({plan:x.plan,unit:"service",
   customerId:x.customer.id,customerAccountId:Number(x.customerAccount.id),
   bankAccountId:bank.id,feeAccountId:fee.id});
  // Unique claim BEFORE the non-idempotent POST. Never retry this claim after
  // an uncertain response or timeout.
  const inserted=await s.from("tripletex_vipps_settlement_transfers").insert({
   environment:x.conn.environment,unit:"service",
   payout_psp_reference:payoutId,payout_date:date,
   gross_ore:x.plan.grossOre,fees_ore:x.plan.feeOre,payout_ore:x.plan.payoutOre,
   digest:x.digest,status:"processing",
   tripletex_customer_id:x.customer.id,
   bank_account_id:bank.id,fee_account_id:fee.id,
   customer_account_id:Number(x.customerAccount.id)
  });
  if(inserted.error)return json({error:"Oppgjøret er allerede reservert eller overført. Kontroller Tripletex før nytt forsøk."},409);
  claimed=true;
  await reviewVoucherDuplicate(x.session,x.conn.environment,date,x.marker);
  writeStarted=true;
  const voucherId=await tripletexCreateVippsSettlementVoucher(voucher,x.session,x.conn.environment);
  const verified=await tripletexRead("/ledger/voucher/"+voucherId,x.session,x.conn.environment);
  if(Number(verified?.value?.id)!==voucherId||
   !String(verified?.value?.description||"").includes(x.marker))
   throw Error("Tripletex kunne ikke bekrefte det nye Vipps-bilaget.");
  const updated=await s.from("tripletex_vipps_settlement_transfers").update({
   status:"confirmed",tripletex_voucher_id:voucherId,confirmed_at:new Date().toISOString(),
   updated_at:new Date().toISOString(),error_code:null
  }).eq("environment",x.conn.environment).eq("unit","service")
   .eq("payout_psp_reference",payoutId).eq("status","processing")
   .select("tripletex_voucher_id").maybeSingle();
  if(updated.error||!updated.data)throw Error("Bilaget kan være opprettet, men kontrolloggen ble ikke lagret.");
  claimed=false;
  return json({ok:true,voucherId,payoutId,amountOre:x.plan.payoutOre,
   message:"Vipps-oppgjøret er bokført som bilag i Tripletex. Kontroller og lukk åpne poster på Vipps oppgjørskunde."});
 }catch(error){
  if(claimed){
   await s.from("tripletex_vipps_settlement_transfers").update({
    status:"needs_review",error_code:writeStarted?"remote_outcome_unknown":"manual_reconciliation",
    updated_at:new Date().toISOString()
   }).eq("unit","service").eq("payout_psp_reference",payoutId).eq("status","processing");
  }
  return json({error:claimed?
   "Oppgjøret kan allerede være bokført i Tripletex. Ikke prøv på nytt før bilagsoversikten er kontrollert.":
   error.message||"Kunne ikke overføre Vipps-oppgjøret."},claimed?409:503);
 }
}
