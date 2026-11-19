import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexCreateUnsentedInvoice} from "../../../../../../lib/tripletexApi";
import {directInvoiceDigest,directInvoicePilotPreview,directInvoiceSearchPath,
 duplicateDirectInvoiceSearch,directInvoiceVerification} from "../../../../../../lib/tripletexDirectInvoicePilot";
import {positiveId} from "../../../../../../lib/tripletexInvoiceReconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function owner(req,write=false){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere Tripletex-fakturaer."},403);
 if(write){
  const guard=sameOriginGuard(req);if(guard)return guard;
  if(process.env.VERCEL_ENV!=="production")
   return json({error:"Direkte fakturaopprettelse er sperret utenfor produksjonsnettsiden."},403);
 }
 return null;
}
export async function GET(req){
 const denied=await owner(req);if(denied)return denied;
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({ok:true,configured:false,claims:[]});
  const {data,error}=await s.from("tripletex_direct_invoice_claims")
   .select("invoice_id,status,tripletex_invoice_id,tripletex_invoice_number,source_number,created_at")
   .eq("environment",connection.environment).order("created_at",{ascending:false}).limit(5000);
  if(error)throw Error("Ingen overføringslogg");
  return json({ok:true,configured:true,claims:(data||[]).map(x=>({
   invoiceId:x.invoice_id,status:x.status,tripletexInvoiceId:x.tripletex_invoice_id,
   tripletexInvoiceNumber:x.tripletex_invoice_number,sourceNumber:x.source_number
  }))});
 }catch{return json({error:"Kunne ikke lese API-overføringene."},503);}
}
async function invoiceState(s,invoiceId,connection){
 const [inv,exported,apiLinked,claim,payments,credits,vipps]=await Promise.all([
  s.from("invoice_drafts").select(
   "id,status,invoice_number,issued_date,due_date,sent_at,paid_ore,credited_ore,customer,line_items,pdf_base64")
   .eq("id",invoiceId).maybeSingle(),
  s.from("invoice_tripletex_transfers").select("status").eq("invoice_id",invoiceId).maybeSingle(),
  s.from("tripletex_invoice_api_links").select("tripletex_invoice_id").eq("invoice_id",invoiceId).maybeSingle(),
  s.from("tripletex_direct_invoice_claims").select("status").eq("invoice_id",invoiceId).maybeSingle(),
  s.from("invoice_payments").select("id").eq("invoice_id",invoiceId).limit(1),
  s.from("invoice_credit_notes").select("id").eq("invoice_id",invoiceId).limit(1),
  s.from("invoice_vipps_payments").select("id").eq("invoice_id",invoiceId).limit(1)
 ]);
 if([inv,exported,apiLinked,claim,payments,credits,vipps].some(x=>x.error))
  throw Error("Fakturaen og historikken kunne ikke leses sikkert.");
 if(exported.data||apiLinked.data||claim.data)
  return {error:"Fakturaen er allerede klargjort, importert eller har et tidligere API-forsøk. Ingen ny faktura opprettes."};
 if((payments.data||[]).length||(credits.data||[]).length||(vipps.data||[]).length)
  return {error:"Fakturaen har betalings- eller kreditthistorikk og må avstemmes før direkteoverføring."};
 const invoice=inv.data;
 if(!invoice||!uuid(invoice.customer?.contactId))
  return {error:"Fakturaen trenger et lagret kundekort før overføring."};
 const {data:linked,error}=await s.from("tripletex_customer_links")
  .select("tripletex_customer_id,status").eq("source_type","contact")
  .eq("source_id",invoice.customer.contactId)
  .eq("environment",connection.environment).maybeSingle();
 if(error||linked?.status!=="linked"||!positiveId(linked.tripletex_customer_id))
  return {error:"Kunden er ikke koblet til Tripletex. Overfør kunden først."};
 return {invoice,customerId:Number(linked.tripletex_customer_id)};
}
async function control(s,invoiceId,connection){
 const context=await invoiceState(s,invoiceId,connection);
 if(context.error)return {error:context.error};
 const session=await tripletexOpenSession(unprotectTripletexToken(connection),connection.environment);
 const vat=await tripletexRead("/ledger/vatType?count=500&typeOfVat=OUTGOING",session,connection.environment);
 if(!Array.isArray(vat.values)||vat.values.length>=500)
  return {error:"MVA-listen fra Tripletex er ufullstendig. Ingen faktura kan overføres."};
 const preview=directInvoicePilotPreview(context.invoice,context.customerId,vat.values);
 if(!preview.ready)return {error:preview.reason};
 const search=await tripletexRead(directInvoiceSearchPath(context.invoice.issued_date,context.customerId),
  session,connection.environment);
 const duplicate=duplicateDirectInvoiceSearch(search?.values,context.customerId,
  context.invoice.issued_date,preview.grossOre);
 if(!duplicate.safe)return {error:duplicate.reason};
 return {...context,preview,session};
}
export async function POST(req){
 const denied=await owner(req,true);if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.invoiceId)||!["check","transfer"].includes(body.action))
  return json({error:"Velg en faktura og en gyldig kontrollhandling."},400);
 if(body.action==="transfer"&&
  (body.confirmed!==true||typeof body.digest!=="string"||!/^[a-f0-9]{64}$/.test(body.digest)))
  return json({error:"Bekreft faktura, beløp og kildeopplysninger før en ekte bokføring."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false,createdId=null;
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Tripletex-API må kobles til først."},409);
  const checked=await control(s,body.invoiceId,connection);
  if(checked.error)return json({error:checked.error},409);
  const {invoice,preview,customerId,session}=checked;
  if(body.action==="check")return json({ok:true,ready:true,invoiceId:invoice.id,
   sourceNumber:invoice.invoice_number,issuedDate:invoice.issued_date,
   grossOre:preview.grossOre,digest:preview.digest,environment:connection.environment,
   message:"Fakturaen er kontrollert mot kundekobling, MVA og mulige duplikater. Ingen bokføring er utført."
  });
  if(body.digest!==preview.digest)
   return json({error:"Fakturaen ble endret etter kontroll. Kontroller den på nytt før bokføring."},409);
  const saved=await s.from("tripletex_direct_invoice_claims").insert({
   invoice_id:invoice.id,environment:connection.environment,status:"processing",
   source_number:invoice.invoice_number,issued_date:invoice.issued_date,
   snapshot_gross_ore:preview.grossOre,snapshot_digest:preview.digest
  }).select("invoice_id").maybeSingle();
  if(saved.error||!saved.data)
   return json({error:"Fakturaen er allerede under behandling eller koblet. Oppdater listen før du gjør noe mer."},409);
  claimed=true;
  // The claim must be committed before the irreversible POST. Read again to
  // avoid knowingly writing if the invoice changed since preflight.
  const again=await s.from("invoice_drafts").select(
   "id,status,invoice_number,issued_date,due_date,sent_at,paid_ore,credited_ore,customer,line_items,pdf_base64")
   .eq("id",invoice.id).maybeSingle();
  if(again.error||!again.data||directInvoiceDigest(again.data,customerId)!==preview.digest)
   throw Error("Fakturaen endret seg etter at overføringen ble låst.");
  const [paymentAgain,creditAgain,vippsAgain]=await Promise.all([
   s.from("invoice_payments").select("id").eq("invoice_id",invoice.id).limit(1),
   s.from("invoice_credit_notes").select("id").eq("invoice_id",invoice.id).limit(1),
   s.from("invoice_vipps_payments").select("id").eq("invoice_id",invoice.id).limit(1)
  ]);
  if([paymentAgain,creditAgain,vippsAgain].some(x=>x.error||(x.data||[]).length))
   throw Error("Betalings- eller kreditthistorikken endret seg etter at overføringen ble låst.");
  const latest=await tripletexRead(directInvoiceSearchPath(invoice.issued_date,customerId),
   session,connection.environment);
  const matches=duplicateDirectInvoiceSearch(latest?.values,customerId,invoice.issued_date,preview.grossOre);
  if(!matches.safe)throw Error("Mulig duplikat i Tripletex før bokføring.");
  // The only accounting write: one invoice, without customer delivery, no payments.
  const remote=await tripletexCreateUnsentedInvoice(preview.body,session,connection.environment);
  createdId=positiveId(remote?.value?.id);
  if(!createdId)throw Error("Tripletex ga ingen entydig faktura-ID etter bokføring.");
  await s.from("tripletex_direct_invoice_claims").update({tripletex_invoice_id:createdId,
   updated_at:new Date().toISOString()}).eq("invoice_id",invoice.id).eq("status","processing");
  const verifiedResponse=await tripletexRead("/invoice/"+createdId,session,connection.environment);
  const verified=directInvoiceVerification(verifiedResponse?.value,customerId,
   invoice.issued_date,preview.grossOre);
  if(!verified.ok)throw Error("Tripletex har opprettet fakturaen, men beløp eller identitet må kontrolleres.");
  const now=new Date().toISOString();
  const linked=await s.from("tripletex_invoice_api_links").insert({
   invoice_id:invoice.id,environment:connection.environment,
   tripletex_invoice_id:verified.id,tripletex_invoice_number:verified.invoiceNumber,
   tripletex_customer_id:customerId,source_invoice_number:invoice.invoice_number,
   invoice_date:invoice.issued_date,invoice_gross_ore:preview.grossOre,
   remote_outstanding_ore:preview.grossOre,local_outstanding_ore:preview.grossOre,
   matched_outstanding_ore:preview.grossOre,matched_at:now,
   remote_is_credited:false,last_checked_at:now
  });
  if(linked.error)throw Error("Tripletex har bokført fakturaen, men lokal kobling mangler.");
  const confirmed=await s.from("tripletex_direct_invoice_claims").update({
   status:"confirmed",tripletex_invoice_id:verified.id,
   tripletex_invoice_number:verified.invoiceNumber,
   confirmed_at:now,updated_at:now,error_code:null
  }).eq("invoice_id",invoice.id).eq("status","processing").select("invoice_id").maybeSingle();
  if(confirmed.error||!confirmed.data)throw Error("Tripletex har bokført fakturaen, men statusbekreftelsen mangler.");
  claimed=false;
  return json({ok:true,status:"confirmed",sourceNumber:invoice.invoice_number,
   tripletexInvoiceNumber:verified.invoiceNumber,tripletexInvoiceId:verified.id,
   message:"Fakturaen er kontrollert og bokført i Tripletex uten ny utsending til kunden."});
 }catch(error){
  if(claimed){
   await s.from("tripletex_direct_invoice_claims").update({
    status:"needs_review",...(createdId?{tripletex_invoice_id:createdId}:{}),
    error_code:"outcome_unknown",updated_at:new Date().toISOString()
   }).eq("invoice_id",body.invoiceId).eq("status","processing");
  }
  return json({error:claimed?
   "Overføringsforsøket må kontrolleres i Tripletex før videre handling. IKKE send fakturaen på nytt.":
   error?.name==="TripletexApiError"?error.message:
   "Kunne ikke fullføre fakturakontrollen. Ingen ny sending til kunden."},claimed?409:503);
 }
}
