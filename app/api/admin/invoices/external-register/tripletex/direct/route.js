import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../../lib/auth";
import {db} from "../../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexCreateUnsentedInvoice,
 tripletexRecordInvoicePayment} from "../../../../../../../lib/tripletexApi";
import {validateExternalImport} from "../../../../../../../lib/externalInvoiceTripletex";
import {nokToOre,nextInvoiceDate} from "../../../../../../../lib/tripletexInvoiceReconciliation";
import {externalDirectBody,externalDirectHash,safePositive,
 safeTripletexPaymentTypes,invoiceIsDuplicate,verifyDirectExternalInvoice,
 assertReadyToPostHistoricalPayment,validInvoiceDay}
 from "../../../../../../../lib/externalInvoiceDirectPayment";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=x=>typeof x==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i.test(x);
const normalize=x=>String(x||"").trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO");
const osloToday=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());
const allInvoiceFields="id,source_system,invoice_number,customer_name,issued_on,due_on,amount_ore,status,paid_on,sha256";
const allClaimFields="external_invoice_id,status,import_number,transfer_method,payment_status,tripletex_invoice_id";
async function remoteInvoices(session,env,date){
 const end=nextInvoiceDate(date);
 if(!end)throw Error("Fakturadatoen er ugyldig.");
 const x=await tripletexRead("/invoice?invoiceDateFrom="+date+
  "&invoiceDateTo="+end+
  "&count=1000&fields=id,invoiceNumber,invoiceDate,customer,amount,amountOutstanding,isCreditNote,isCredited",
  session,env);
 if(!Array.isArray(x?.values)||x.values.length>=1000||
  (Number.isFinite(Number(x.fullResultSize))&&Number(x.fullResultSize)>x.values.length))
  throw Error("Tripletex returnerte en ufullstendig fakturaliste.");
 return x.values;
}
async function linkedCustomer(s,invoice,session,environment){
 const linked=await s.from("invoice_customer_card_links").select("contact_id")
  .eq("invoice_kind","external").eq("invoice_id",invoice.id).maybeSingle();
 if(linked.error)throw Error("Kunne ikke lese kundekortkoblingen.");
 if(!linked.data?.contact_id)throw Error("Koble fakturaen til kundekort i Aadland Service først.");
 const contactId=linked.data.contact_id;
 const [local,remoteLink]=await Promise.all([
  s.from("admin_customer_contacts").select("id,name").eq("id",contactId).maybeSingle(),
  s.from("tripletex_customer_links").select("tripletex_customer_id,status")
   .eq("source_type","contact").eq("source_id",contactId)
   .eq("environment",environment).maybeSingle()
 ]);
 if(local.error||remoteLink.error||!local.data||
  remoteLink.data?.status!=="linked"||
  !safePositive(remoteLink.data?.tripletex_customer_id))
  throw Error("Kunden må være opprettet eller koblet i Tripletex før overføring.");
 const customerId=Number(remoteLink.data.tripletex_customer_id);
 const trip=await tripletexRead("/customer/"+customerId,session,environment);
 const customer=trip?.value;
 if(safePositive(customer?.id)!==customerId||
  !safePositive(customer?.customerNumber)||
  normalize(customer?.name)!==normalize(local.data.name)||
  normalize(customer?.name)!==normalize(invoice.customer_name))
  throw Error("Kundeopplysningene stemmer ikke mellom originalfakturaen, Aadland Service og Tripletex.");
 return {contactId,id:customerId,number:Number(customer.customerNumber)};
}
async function verifiedTypes(session,environment){
 const remote=await tripletexRead("/invoice/paymentType?count=200",session,environment);
 return safeTripletexPaymentTypes(remote?.values);
}
async function getInvoice(s,id){
 const [inv,claim]=await Promise.all([
  s.from("external_customer_invoices").select(allInvoiceFields)
   .eq("id",id).maybeSingle(),
  s.from("external_invoice_tripletex_imports").select(allClaimFields)
   .eq("external_invoice_id",id).maybeSingle()
 ]);
 if(inv.error||claim.error)throw Error("Kunde-/fakturaarkivet kunne ikke kontrolleres.");
 return {invoice:inv.data,claim:claim.data};
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan kontrollere automatisk Tripletex-overføring."},403);
 const id=new URL(req.url).searchParams.get("id");
 if(!uuid(id))return json({error:"Ugyldig ekstern faktura."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const {invoice,claim}=await getInvoice(s,id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  const connection=await storedTripletexConnection(s);
  if(!connection||connection.environment!=="production")
   return json({ok:true,configured:false,paidOn:invoice.paid_on||null,
    paymentTypes:[],importExists:Boolean(claim)});
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  let paymentTypes=[],paymentTypesError=null;
  if(invoice.status==="paid"&&!claim){
   try{paymentTypes=await verifiedTypes(session,connection.environment);}
   catch{paymentTypesError="Betalingsmåtene kunne ikke hentes fra Tripletex. Automatisk registrering av en betalt faktura er sperret.";}
  }
  return json({ok:true,configured:true,paidOn:invoice.paid_on||null,
   paymentTypes,paymentTypesError,importExists:Boolean(claim)});
 }catch(e){return json({error:String(e.message||"Tripletex-kontrollen feilet.").slice(0,280)},503);}
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eier kan godkjenne ekte overføring."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Direkte overføring er sperret utenfor produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(body?.action!=="transfer-direct"||!uuid(body.id)||
  body.confirmed!==true||body.notBookedElsewhere!==true||
  body.accountingPeriodConfirmed!==true||
  (body.paymentTypeId!=null&&body.verifiedPaymentSource!==true))
  return json({error:"Bekreft fakturaen, at den ikke er bokført tidligere, og korrekt betalingsgrunnlag."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false,createdId=null,invoiceConfirmed=false,paymentAttempted=false;
 try{
  const {invoice,claim}=await getInvoice(s,body.id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  if(claim)return json({error:"Fakturaen har en CSV-import, tidligere API-overføring eller uavklart forsøk. Ingen ny overføring tillatt."},409);
  if(invoice.status==="paid"&&
   (!validInvoiceDay(invoice.paid_on)||invoice.paid_on>osloToday()))
   return json({error:"Lagret betalingsdato er manglende, ugyldig eller fremtidig. Rett fakturaens betalingsstatus."},409);
  const record=validateExternalImport(invoice,{...body,paymentTypeImportId:""});
  const native=await s.from("invoice_drafts").select("id")
   .eq("invoice_number",invoice.invoice_number).neq("status","draft").limit(1);
  if(native.error||native.data?.length)
   return json({error:"Fakturanummeret finnes i Aadland Service eller kontrollen feilet. Ikke dobbelbokfør."},409);
  const connection=await storedTripletexConnection(s);
  if(!connection||connection.environment!=="production")
   return json({error:"Koble Tripletex-produksjon til først."},409);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  const customer=await linkedCustomer(s,invoice,session,connection.environment);
  const types=await tripletexRead("/ledger/vatType?count=500&typeOfVat=OUTGOING",
   session,connection.environment);
  if(!Array.isArray(types?.values)||types.values.length>=500)
   return json({error:"MVA-kodene i Tripletex kan ikke kontrolleres fullstendig."},409);
  const invoiceBody=externalDirectBody(invoice,record,customer.id,types.values);
  if(!invoiceBody)return json({error:"Fakturaen har ufullstendige kildeopplysninger."},409);
  const paymentTypeId=invoice.status==="paid"?safePositive(body.paymentTypeId):null;
  if(invoice.status==="paid"){
   const types=await verifiedTypes(session,connection.environment);
   if(!paymentTypeId||!types.some(x=>x.id===paymentTypeId))
    return json({error:"Velg en gyldig betalingsmåte fra Tripletex. Betalingsdato og beløp hentes automatisk fra fakturaen."},409);
  }else if(body.paymentTypeId!==null&&body.paymentTypeId!==undefined&&body.paymentTypeId!==""){
   return json({error:"Ubetalt faktura skal ikke ha betalingstype."},400);
  }
  const remote=await remoteInvoices(session,connection.environment,invoice.issued_on);
  const dupe=invoiceIsDuplicate(remote,customer.id,invoice.issued_on,
   Number(invoice.amount_ore),record.import_number);
  if(!dupe.safe)return json({error:dupe.reason},409);
  // This one-row UNIQUE claim is shared with CSV; no irreversible API write
  // can happen before the idempotent claim is committed.
  const saved=await s.from("external_invoice_tripletex_imports").insert({
   external_invoice_id:invoice.id,...record,prepared_by:user.id,
   snapshot_contact_id:customer.contactId,
   tripletex_customer_id:customer.id,
   tripletex_customer_number:customer.number,
   snapshot_customer_name:invoice.customer_name,
   transfer_method:"api",status:"processing",
   payment_status:invoice.status==="paid"?"pending":"not_applicable",
   payment_date:invoice.status==="paid"?invoice.paid_on:null,
   payment_type_id:paymentTypeId
  }).select("external_invoice_id").maybeSingle();
  if(saved.error||!saved.data)return json({error:"En annen overføring er allerede klargjort eller i arbeid. Oppdater før nytt forsøk."},409);
  claimed=true;
  // Re-fetch immutable invoice and guard against edited status after claim.
  const latest=await getInvoice(s,invoice.id);
  if(!latest.invoice||latest.claim?.status!=="processing"||
   latest.invoice.status!==invoice.status||
   latest.invoice.paid_on!==invoice.paid_on||
   latest.invoice.sha256!==invoice.sha256||
   Number(latest.invoice.amount_ore)!==Number(invoice.amount_ore)||
   latest.invoice.customer_name!==invoice.customer_name)
   throw Error("Originalfakturaen ble endret etter at overføringen var låst.");
  const listBeforePost=await remoteInvoices(session,connection.environment,invoice.issued_on);
  const again=invoiceIsDuplicate(listBeforePost,customer.id,invoice.issued_on,
   Number(invoice.amount_ore),record.import_number);
  if(!again.safe)throw Error(again.reason);
  const returned=await tripletexCreateUnsentedInvoice(invoiceBody,
   session,connection.environment);
  createdId=safePositive(returned?.value?.id);
  if(!createdId)throw Error("Tripletex bekreftet ikke faktura-ID. Ikke send samme faktura på nytt.");
  const stamped=await s.from("external_invoice_tripletex_imports")
   .update({tripletex_invoice_id:createdId,updated_at:new Date().toISOString()})
   .eq("external_invoice_id",invoice.id).eq("status","processing")
   .select("external_invoice_id").maybeSingle();
  if(stamped.error||!stamped.data)
   throw Error("Fakturaen kan være bokført i Tripletex, men lokal kobling mangler.");
  const invoiceDetailPath="/invoice/"+createdId+
   "?fields=id,invoiceNumber,invoiceDate,customer,amount,amountOutstanding,isCreditNote,isCredited,currency";
  const check=await tripletexRead(invoiceDetailPath,session,connection.environment);
  const verified=verifyDirectExternalInvoice(check?.value,customer.id,invoice.issued_on,
   Number(invoice.amount_ore));
  const marked=await s.from("external_invoice_tripletex_imports").update({
   status:"confirmed",confirmed_by:user.id,confirmed_at:new Date().toISOString(),
   tripletex_invoice_number:verified.number,updated_at:new Date().toISOString()
  }).eq("external_invoice_id",invoice.id).eq("status","processing")
   .select("external_invoice_id").maybeSingle();
  if(marked.error||!marked.data)
   throw Error("Fakturaen er opprettet i Tripletex, men statusen må avklares.");
  invoiceConfirmed=true;
  if(invoice.status==="paid"){
   // Explicitly claim payment BEFORE network call. Ambiguous outcomes cannot
   // be retried automatically under any circumstances.
   const payClaim=await s.from("external_invoice_tripletex_imports")
    .update({payment_status:"processing",updated_at:new Date().toISOString()})
    .eq("external_invoice_id",invoice.id).eq("status","confirmed")
    .eq("payment_status","pending").select("external_invoice_id").maybeSingle();
   if(payClaim.error||!payClaim.data)
    throw Error("Betalingen kan ikke låses mot dobbel overføring.");
   const ready=await tripletexRead(invoiceDetailPath,session,connection.environment);
   const payment=assertReadyToPostHistoricalPayment(invoice,ready?.value,
    paymentTypeId,osloToday());
   paymentAttempted=true;
   await tripletexRecordInvoicePayment(createdId,payment.date,payment.paymentTypeId,
    payment.amountOre,session,connection.environment);
   const after=await tripletexRead(invoiceDetailPath,session,connection.environment);
   if(nokToOre(after?.value?.amountOutstanding)!==0||
    nokToOre(after?.value?.amount)!==Number(invoice.amount_ore)||
    safePositive(after?.value?.customer?.id)!==customer.id||
    after?.value?.isCreditNote||after?.value?.isCredited)
    throw Error("Betalingen ble sendt, men Tripletex bekreftet ikke full innbetaling.");
   const done=await s.from("external_invoice_tripletex_imports").update({
    payment_status:"confirmed",payment_confirmed_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
   }).eq("external_invoice_id",invoice.id)
    .eq("payment_status","processing").select("external_invoice_id").maybeSingle();
   if(done.error||!done.data)
    throw Error("Betaling ble registrert i Tripletex, men lokal status kunne ikke oppdateres.");
  }
  claimed=false;
  return json({ok:true,tripletexInvoiceId:verified.id,
   tripletexInvoiceNumber:verified.number,sourceInvoiceNumber:invoice.invoice_number,
   paymentStatus:invoice.status==="paid"?"confirmed":"not_applicable",
   paidOn:invoice.status==="paid"?invoice.paid_on:null,
   note:invoice.status==="paid"?
    "Fakturaen ble opprettet uten ny utsending, og innbetalingen ble bokført med den tidligere registrerte betalingsdatoen.":
    "Fakturaen ble opprettet i Tripletex uten ny utsending til kunden."});
 }catch(error){
  if(claimed){
   const updates=paymentAttempted?
    {payment_status:"needs_review"}:
    invoiceConfirmed&&createdId?
     {payment_status:"needs_review"}:
     {};
   await s.from("external_invoice_tripletex_imports").update({
    status:invoiceConfirmed?"confirmed":"needs_review",
    ...(createdId?{tripletex_invoice_id:createdId}:{}),
    ...updates,updated_at:new Date().toISOString()
   }).eq("external_invoice_id",body.id)
    .in("status",["processing","confirmed"]);
  }
  return json({error:claimed?
   "Overføringen er påbegynt, men resultatet må kontrolleres i Tripletex. Ikke trykk overfør på nytt. Original betalingsdato og referanse er bevart.":
   String(error?.message||"Fakturaen kunne ikke kontrolleres.").slice(0,280)},
   claimed?409:503);
 }
}
