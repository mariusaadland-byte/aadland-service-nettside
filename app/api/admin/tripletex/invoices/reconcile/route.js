import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../../lib/tripletexApi";
import {invoiceGrossOre} from "../../../../../../lib/invoicePaymentStatus";
import {nextInvoiceDate,positiveId,verifyTripletexInvoice,compareTripletexBalance} from "../../../../../../lib/tripletexInvoiceReconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const columns="invoice_id,environment,tripletex_invoice_id,tripletex_invoice_number,invoice_gross_ore,remote_outstanding_ore,local_outstanding_ore,last_checked_at,linked_at";
async function owner(req,write=false){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan avstemme Tripletex-fakturaer."},403);
 if(write){
  const guard=sameOriginGuard(req);if(guard)return guard;
  if(process.env.VERCEL_ENV!=="production")
   return json({error:"Tripletex-avstemming kan bare lagres på den publiserte nettsiden."},403);
 }
 return null;
}
export async function GET(req){
 const denied=await owner(req);if(denied)return denied;
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({configured:false,links:[]});
  const {data,error}=await s.from("tripletex_invoice_api_links")
   .select(columns).eq("environment",connection.environment)
   .order("last_checked_at",{ascending:false}).limit(5000);
  if(error)throw Error("Kunne ikke lese avstemmingsloggen.");
  const links=(data||[]).map(row=>({
   invoiceId:row.invoice_id,
   invoiceNumber:row.tripletex_invoice_number,
   tripletexId:row.tripletex_invoice_id,
   remoteOutstandingOre:row.remote_outstanding_ore,
   localOutstandingOre:row.local_outstanding_ore,
   checkedAt:row.last_checked_at,
   comparison:compareTripletexBalance(row).status
  }));
  return json({ok:true,configured:true,links});
 }catch{
  return json({error:"Kunne ikke hente lagrede Tripletex-avstemminger."},503);
 }
}
export async function POST(req){
 const denied=await owner(req,true);if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 if(!["link","check"].includes(body.action)||!uuid(body.invoiceId))
  return json({error:"Velg en gyldig faktura og kontrollhandling."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Koble til Tripletex før kontroll."},409);
  const [transferResult,directResult,invoiceResult,linkResult]=await Promise.all([
   s.from("invoice_tripletex_transfers").select(
    "invoice_id,status,import_number,original_invoice_number,original_issued_date,snapshot_gross_ore")
    .eq("invoice_id",body.invoiceId).maybeSingle(),
   s.from("tripletex_direct_invoice_claims").select(
    "invoice_id,status,tripletex_invoice_number,source_number,issued_date,snapshot_gross_ore")
    .eq("invoice_id",body.invoiceId).maybeSingle(),
   s.from("invoice_drafts").select(
    "id,status,customer,line_items,invoice_number,issued_date,paid_ore,credited_ore")
    .eq("id",body.invoiceId).maybeSingle(),
   s.from("tripletex_invoice_api_links").select(
    "invoice_id,environment,tripletex_invoice_id")
    .eq("invoice_id",body.invoiceId).maybeSingle()
  ]);
  if(transferResult.error||directResult.error||invoiceResult.error||linkResult.error)
   return json({error:"Faktura- eller importstatus kunne ikke leses. Ingen avstemming utført."},503);
  const transfer=transferResult.data||(directResult.data?.status==="confirmed"?{
   invoice_id:directResult.data.invoice_id,status:"confirmed",
   import_number:directResult.data.tripletex_invoice_number,
   original_invoice_number:directResult.data.source_number,
   original_issued_date:directResult.data.issued_date,
   snapshot_gross_ore:directResult.data.snapshot_gross_ore
  }:null);
  const invoice=invoiceResult.data,existing=linkResult.data;
  if(!invoice||!transfer||transfer.status!=="confirmed"||invoice.status!=="sent")
   return json({error:"Fakturaen må være sendt og importen må være bekreftet før API-kobling."},409);
  if(invoice.invoice_number!==transfer.original_invoice_number||
   invoice.issued_date!==transfer.original_issued_date||
   invoiceGrossOre(invoice)!==Number(transfer.snapshot_gross_ore))
   return json({error:"Den opprinnelige fakturaen stemmer ikke med importloggen. Stopp og kontroller."},409);
  if(Number(invoice.credited_ore||0)>0)
   return json({error:"Fakturaen har kreditnota. Den krever regnskapsmessig kontroll."},409);
  if(existing&&existing.environment!==connection.environment)
   return json({error:"Fakturaen er koblet til et annet Tripletex-miljø."},409);
  if(body.action==="check"&&!existing)
   return json({error:"Koble fakturaen til Tripletex før ny kontroll."},409);
  const contactId=invoice.customer?.contactId;
  if(!uuid(contactId))
   return json({error:"Fakturaen mangler lagret kundekort-ID. Kontroller kundekoblingen først."},409);
  const customerLinkResult=await s.from("tripletex_customer_links").select(
   "status,tripletex_customer_id")
   .eq("source_type","contact").eq("source_id",contactId)
   .eq("environment",connection.environment).maybeSingle();
  if(customerLinkResult.error||customerLinkResult.data?.status!=="linked"||
   !positiveId(customerLinkResult.data.tripletex_customer_id))
   return json({error:"Overfør og koble kunden til Tripletex før fakturaen kan avstemmes."},409);
  const customerId=Number(customerLinkResult.data.tripletex_customer_id);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  let remoteId=positiveId(existing?.tripletex_invoice_id);
  if(!remoteId){
   const next=nextInvoiceDate(transfer.original_issued_date);
   if(!next)return json({error:"Ugyldig opprinnelig fakturadato."},409);
   const path="/invoice?invoiceDateFrom="+transfer.original_issued_date+
    "&invoiceDateTo="+next+"&invoiceNumber="+transfer.import_number+"&count=10";
   const found=await tripletexRead(path,session,connection.environment);
   if(!Array.isArray(found.values))
    return json({error:"Tripletex svarte ikke med en gyldig fakturaliste."},503);
   const matches=found.values.filter(x=>Number(x.invoiceNumber)===Number(transfer.import_number));
   if(matches.length!==1||!positiveId(matches[0].id))
    return json({error:matches.length?
     "Flere mulige fakturaer ble funnet i Tripletex. Kontroller importen.":
     "Fant ikke fakturanummeret i Tripletex. Kontroller at CSV-filen faktisk er importert."},409);
   remoteId=Number(matches[0].id);
  }
  const received=await tripletexRead("/invoice/"+remoteId,session,connection.environment);
  const result=verifyTripletexInvoice(received?.value,transfer,customerId);
  if(!result.ok)return json({error:result.reason},409);
  if(existing&&Number(existing.tripletex_invoice_id)!==result.id)
   return json({error:"Tripletex-ID stemmer ikke med tidligere kobling."},409);
  const paid=Number(invoice.paid_ore||0),credited=Number(invoice.credited_ore||0);
  if(!Number.isSafeInteger(paid)||paid<0||!Number.isSafeInteger(credited)||credited<0||
   paid+credited>result.grossOre)
   return json({error:"Lokale betalinger kan ikke avstemmes. Kontroller historikken."},409);
  const localOutstandingOre=result.grossOre-paid-credited;
  const balanceMatched=localOutstandingOre===result.outstandingOre;
  // Re-baseline ONLY if both systems agree and no remote write is unresolved.
  // Otherwise keep the last confirmed balance for pending payment comparisons.
  const {data:uncertain,error:uncertainError}=await s.from("tripletex_payment_transfers")
   .select("payment_id").eq("invoice_id",invoice.id)
   .in("status",["processing","needs_review"]).limit(1);
  if(uncertainError)return json({error:"Kunne ikke kontrollere tidligere betalingsforsøk."},503);
  const canBaseline=balanceMatched&&!(uncertain||[]).length;
  const record={
   ...(canBaseline?{
    matched_outstanding_ore:localOutstandingOre,
    matched_at:new Date().toISOString()
   }:{}),
   invoice_id:invoice.id,environment:connection.environment,
   tripletex_invoice_id:result.id,tripletex_invoice_number:result.invoiceNumber,
   tripletex_customer_id:result.customerId,source_invoice_number:invoice.invoice_number,
   invoice_date:result.invoiceDate,invoice_gross_ore:result.grossOre,
   remote_outstanding_ore:result.outstandingOre,local_outstanding_ore:localOutstandingOre,
   remote_is_credited:false,last_checked_at:new Date().toISOString()
  };
  const {error:saveError}=await s.from("tripletex_invoice_api_links")
   .upsert(record,{onConflict:"invoice_id"});
  if(saveError)return json({error:"Fakturaen ble kontrollert, men koblingen kunne ikke lagres. Oppdater listen."},409);
  return json({ok:true,invoiceId:invoice.id,tripletexId:result.id,
   invoiceNumber:result.invoiceNumber,remoteOutstandingOre:result.outstandingOre,
   localOutstandingOre,comparison:localOutstandingOre===result.outstandingOre?"match":"difference",
   message:localOutstandingOre===result.outstandingOre?
    "Tripletex-faktura og restbeløp er kontrollert. Ingen betaling er bokført.":
    "Fakturaen er koblet, men restbeløpene er forskjellige. Kontroller betalinger og kreditnotaer før synkronisering."
  });
 }catch(error){
  return json({error:error?.name==="TripletexApiError"?error.message:
   "Fakturaavstemmingen kunne ikke fullføres. Ingen faktura eller betaling er skrevet i Tripletex."},503);
 }
}
