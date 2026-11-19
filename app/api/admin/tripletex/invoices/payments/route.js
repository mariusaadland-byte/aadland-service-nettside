import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexRecordInvoicePayment} from "../../../../../../lib/tripletexApi";
import {verifyTripletexInvoice,positiveId} from "../../../../../../lib/tripletexInvoiceReconciliation";
import {paymentTypeList,paymentReadiness,positiveInteger} from "../../../../../../lib/tripletexPaymentSync";
import {invoiceGrossOre} from "../../../../../../lib/invoicePaymentStatus";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function permitted(req,write){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere og bokføre Tripletex-betalinger."},403);
 if(write){
  const guard=sameOriginGuard(req);if(guard)return guard;
  if(process.env.VERCEL_ENV!=="production")
   return json({error:"Ekte betalingsregistreringer kan bare utføres på produksjonsnettsiden."},403);
 }
 return null;
}
async function loadContext(s,invoiceId,connection){
 const [inv,imported,linked,records,transferred,credits,vipps]=await Promise.all([
  s.from("invoice_drafts").select("id,status,invoice_number,line_items,customer,issued_date,paid_ore,credited_ore")
   .eq("id",invoiceId).maybeSingle(),
  s.from("invoice_tripletex_transfers").select(
   "invoice_id,status,import_number,original_invoice_number,original_issued_date,snapshot_gross_ore")
   .eq("invoice_id",invoiceId).maybeSingle(),
  s.from("tripletex_invoice_api_links").select(
   "invoice_id,environment,tripletex_invoice_id,tripletex_invoice_number,tripletex_customer_id,invoice_gross_ore,matched_outstanding_ore,matched_at")
   .eq("invoice_id",invoiceId).maybeSingle(),
  s.from("invoice_payments").select(
   "id,invoice_id,amount_ore,paid_on,recorded_at,reversed_at,vipps_reference")
   .eq("invoice_id",invoiceId).order("recorded_at",{ascending:true}).limit(1001),
  s.from("tripletex_payment_transfers").select(
   "payment_id,invoice_id,status,amount_ore,payment_date,outstanding_before_ore,outstanding_after_ore,created_at,confirmed_at")
   .eq("invoice_id",invoiceId).order("created_at",{ascending:true}).limit(1001),
  s.from("invoice_credit_notes").select("id").eq("invoice_id",invoiceId).limit(1),
  s.from("invoice_vipps_payments").select("id,state,refunded_ore")
   .eq("invoice_id",invoiceId).limit(1001)
 ]);
 if([inv,imported,linked,records,transferred,credits,vipps].some(x=>x.error))
  throw Error("Kunne ikke lese fullstendig faktura- og betalingshistorikk.");
 if([records,transferred,vipps].some(x=>(x.data||[]).length>1000))
  throw Error("For mange betalinger til sikker automatisk avstemming.");
 const invoice=inv.data,transfer=imported.data,link=linked.data;
 if(!invoice||invoice.status!=="sent"||!transfer||transfer.status!=="confirmed"||!link||
  connection.environment!==link.environment)
  return {valid:false,reason:"Fakturaen er ikke verifisert og importert i Tripletex ennå."};
 if(!positiveId(link.tripletex_invoice_id)||!positiveId(link.tripletex_customer_id)||
  Number(link.tripletex_invoice_number)!==Number(transfer.import_number)||
  Number(link.invoice_gross_ore)!==Number(transfer.snapshot_gross_ore)||
  Number(transfer.snapshot_gross_ore)!==invoiceGrossOre(invoice)||
  String(invoice.invoice_number)!==String(transfer.original_invoice_number)||
  String(invoice.issued_date)!==String(transfer.original_issued_date))
  return {valid:false,reason:"Fakturaidentiteten stemmer ikke med importloggen. Ingen betaling kan overføres."};
 return {valid:true,invoice,transfer,link,
  payments:records.data||[],transfers:transferred.data||[],
  credits:credits.data||[],vipps:vipps.data||[]};
}
async function remoteReview(context,session,environment){
 const result=await tripletexRead(
  "/invoice/"+context.link.tripletex_invoice_id,session,environment);
 const verified=verifyTripletexInvoice(
  result?.value,context.transfer,context.link.tripletex_customer_id);
 if(!verified.ok||verified.id!==Number(context.link.tripletex_invoice_id))
  throw Error("Tripletex-fakturaen har endret identitet, beløp eller krediteringsstatus. Stopp.");
 const ready=paymentReadiness({
  link:context.link,invoice:context.invoice,payments:context.payments,
  transfers:context.transfers,remoteOutstandingOre:verified.outstandingOre,
  creditNotes:context.credits,vippsPayments:context.vipps
 });
 return {verified,ready};
}
async function typeChoices(session,environment){
 const fetched=await tripletexRead("/invoice/paymentType?count=1000",session,environment);
 if(!Array.isArray(fetched?.values)||fetched.values.length>=1000)
  throw Error("Betalingstypene i Tripletex er ufullstendige. Kontroller oppsettet.");
 return paymentTypeList(fetched);
}
async function prepare(s,invoiceId){
 const connection=await storedTripletexConnection(s);
 if(!connection)return {error:"Tripletex er ikke tilkoblet."};
 const context=await loadContext(s,invoiceId,connection);
 if(!context.valid)return {error:context.reason};
 const session=await tripletexOpenSession(
  unprotectTripletexToken(connection),connection.environment);
 const check=await remoteReview(context,session,connection.environment);
 return {context,connection,session,...check};
}
export async function GET(req){
 const denied=await permitted(req,false);if(denied)return denied;
 const invoiceId=new URL(req.url).searchParams.get("invoiceId");
 if(!uuid(invoiceId))return json({error:"Velg en gyldig faktura."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const state=await prepare(s,invoiceId);
  if(state.error)return json({ok:true,ready:false,reason:state.error,payments:[],types:[]});
  const types=state.ready.ok&&state.ready.next?
   await typeChoices(state.session,state.connection.environment):[];
  const readinessReason=!state.ready.ok?state.ready.reason:
   !state.ready.next?"Ingen nye innbetalinger som skal registreres.":
   types.length?"Klar for kontrollert betalingsregistrering.":
   "Ingen aktive betalingstyper funnet i Tripletex.";
  return json({ok:true,ready:state.ready.ok&&Boolean(state.ready.next)&&types.length>0,
   reason:readinessReason,
   next:state.ready.ok?state.ready.next:null,types,
   remainingCount:state.ready.ok?state.ready.pending.length:0,
   remoteOutstandingOre:state.ready.ok?state.ready.remoteOutstandingOre:state.verified.outstandingOre,
   localOutstandingOre:state.ready.ok?state.ready.localOutstandingOre:null,
   recordedCount:state.context.transfers.filter(t=>t.status==="confirmed").length
  });
 }catch(error){
  return json({error:error?.name==="TripletexApiError"?error.message:
   "Kunne ikke kontrollere betalingsgrunnlaget. Ingen betaling sendt."},503);
 }
}
export async function POST(req){
 const denied=await permitted(req,true);if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const {invoiceId,paymentId,paymentTypeId,expectedRemoteOutstandingOre}=body;
 if(body.action!=="record"||body.confirmed!==true||!uuid(invoiceId)||
  !uuid(paymentId)||!positiveInteger(paymentTypeId)||
  !Number.isSafeInteger(expectedRemoteOutstandingOre)||expectedRemoteOutstandingOre<0)
  return json({error:"Bekreft riktig innbetaling, type og avstemt restbeløp."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false;
 try{
  const state=await prepare(s,invoiceId);
  if(state.error)return json({error:state.error},409);
  if(!state.ready.ok||!state.ready.next)
   return json({error:state.ready.reason||"Ingen innbetalinger klare."},409);
  const next=state.ready.next;
  if(next.id!==paymentId||Number(expectedRemoteOutstandingOre)!==state.verified.outstandingOre)
   return json({error:"Betalingen eller restbeløpet har endret seg. Last inn kontrollen på nytt."},409);
  if(next.amountOre>state.verified.outstandingOre)
   return json({error:"Betalingen er større enn restbeløpet i Tripletex."},409);
  const types=await typeChoices(state.session,state.connection.environment);
  if(!types.some(t=>t.id===Number(paymentTypeId)))
   return json({error:"Betalingstypen finnes ikke som et aktivt valg i Tripletex."},409);
  // Exact claim before irreversible PUT. Unique payment_id + partial unique
  // per-invoice status prevents duplicate and simultaneous remote writes.
  const claim=await s.from("tripletex_payment_transfers").insert({
   payment_id:paymentId,invoice_id:invoiceId,environment:state.connection.environment,
   tripletex_invoice_id:state.verified.id,payment_type_id:Number(paymentTypeId),
   payment_date:next.paidOn,amount_ore:next.amountOre,status:"processing",
   outstanding_before_ore:state.verified.outstandingOre
  });
  if(claim.error)return json({error:"Denne innbetalingen er allerede overført eller behandles. Oppdater listen; ikke send den på nytt."},409);
  claimed=true;
  // Read the remote balance again AFTER the database claim and immediately
  // BEFORE the irreversible payment request. Abort if Tripletex changed
  // outside our integration between preflight and claim.
  const justBefore=await tripletexRead("/invoice/"+state.verified.id,
   state.session,state.connection.environment);
  const rechecked=verifyTripletexInvoice(justBefore?.value,state.context.transfer,
   state.context.link.tripletex_customer_id);
  if(!rechecked.ok||rechecked.id!==state.verified.id||
   rechecked.outstandingOre!==state.verified.outstandingOre)
   throw Error("Tripletex endret seg mens betalingskontrollen pågikk. Ingen betaling sendt.");
  await tripletexRecordInvoicePayment(state.verified.id,next.paidOn,
   Number(paymentTypeId),next.amountOre,state.session,state.connection.environment);
  const latest=await tripletexRead("/invoice/"+state.verified.id,
   state.session,state.connection.environment);
  const verified=verifyTripletexInvoice(latest?.value,state.context.transfer,
   state.context.link.tripletex_customer_id);
  const expected=state.verified.outstandingOre-next.amountOre;
  if(!verified.ok||verified.id!==state.verified.id||verified.outstandingOre!==expected)
   throw Error("Tripletex bekreftet ikke forventet restbeløp etter registreringen.");
  const updated=await s.from("tripletex_payment_transfers").update({
   status:"confirmed",outstanding_after_ore:expected,confirmed_at:new Date().toISOString(),
   updated_at:new Date().toISOString(),error_code:null
  }).eq("payment_id",paymentId).eq("invoice_id",invoiceId)
   .eq("status","processing").select("payment_id").maybeSingle();
  if(updated.error||!updated.data)
   throw Error("Betalingen kan være bokført, men overføringsloggen kunne ikke bekreftes.");
  claimed=false;
  await s.from("tripletex_invoice_api_links").update({
   remote_outstanding_ore:expected,
   local_outstanding_ore:state.ready.localOutstandingOre,
   last_checked_at:new Date().toISOString()
  }).eq("invoice_id",invoiceId)
   .eq("environment",state.connection.environment)
   .eq("tripletex_invoice_id",state.verified.id);
  return json({ok:true,invoiceId,paymentId,amountOre:next.amountOre,
   remoteOutstandingOre:expected,
   message:"Betalingen er bokført i Tripletex og restbeløpet er bekreftet. Ingen faktura er sendt til kunden."});
 }catch(error){
  if(claimed){
   // Never retry a payment with an uncertain provider outcome. Human reconciliation only.
   await s.from("tripletex_payment_transfers").update({
    status:"needs_review",error_code:"provider_outcome_unknown",updated_at:new Date().toISOString()
   }).eq("payment_id",paymentId).eq("invoice_id",invoiceId).eq("status","processing");
  }
  return json({error:claimed?
   "Betalingsforsøket har uavklart resultat. Kontroller faktura og betalinger i Tripletex. IKKE prøv igjen før det er avstemt.":
   error?.name==="TripletexApiError"?error.message:
   "Betalingen kunne ikke kontrolleres. Ingen ny betaling ble sendt."},claimed?409:503);
 }
}
