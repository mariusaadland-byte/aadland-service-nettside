import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../../lib/tripletexApi";
import {nextInvoiceDate,nokToOre}
 from "../../../../../../lib/tripletexInvoiceReconciliation";
import {validateExternalImport,externalTripletexCsv}
 from "../../../../../../lib/externalInvoiceTripletex";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=x=>typeof x==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const cols="external_invoice_id,import_number,status,vat_rate,base_ore,vat_ore,snapshot_gross_ore,snapshot_sha256,snapshot_paid,payment_type_import_id,prepared_at,confirmed_at,tripletex_invoice_id,snapshot_contact_id,tripletex_customer_id,tripletex_customer_number,snapshot_customer_name";
const normalized=x=>String(x||"").trim().replace(/\\s+/g," ").toLocaleLowerCase("nb-NO");
async function checkedRemoteList(session,environment,date){
 const next=nextInvoiceDate(date);
 if(!next)throw Error("Ugyldig fakturadato.");
 const remote=await tripletexRead("/invoice?invoiceDateFrom="+date+
  "&invoiceDateTo="+next+"&count=1000&fields=id,invoiceNumber,invoiceDate,amount,amountOutstanding,customer,isCreditNote,isCredited",
  session,environment);
 if(!Array.isArray(remote?.values)||remote.values.length>=1000||
  (Number.isFinite(Number(remote?.fullResultSize))&&
   Number(remote.fullResultSize)>remote.values.length))
  throw Error("Tripletex returnerte en ufullstendig fakturaliste. Ingen import bekreftes.");
 return remote.values;
}
async function verifiedCustomer(s,invoice,session,environment){
 const [linkResult,connectionResult]=await Promise.all([
  s.from("invoice_customer_card_links").select("contact_id")
   .eq("invoice_kind","external").eq("invoice_id",invoice.id).maybeSingle(),
  s.from("tripletex_customer_links")
   .select("source_id,status,tripletex_customer_id").eq("source_type","contact")
   .eq("environment",environment).eq("status","linked").limit(5001)
 ]);
 if(linkResult.error||connectionResult.error)throw Error("Kundekortkoblingene kunne ikke kontrolleres.");
 const contactId=linkResult.data?.contact_id;
 if(!contactId)return null;
 // A small owner-only customer mapping is enough; never silently use another
 // contact's remote ID for an issued invoice.
 const links=connectionResult.data||[];
 if(links.length>=5001)throw Error("Kundelisten er for omfattende for en sikker kontroll.");
 const local=links.find(x=>x.source_id===contactId);
 if(!local||!positive(local.tripletex_customer_id))return null;
 const response=await tripletexRead("/customer/"+Number(local.tripletex_customer_id),
  session,environment);
 const remote=response?.value;
 if(Number(remote?.id)!==Number(local.tripletex_customer_id)||
  !positive(remote.customerNumber)||
  typeof remote.name!=="string"||!remote.name.trim())
  throw Error("Tripletex bekreftet ikke korrekt kundenummer og kunde-ID. Kontroller kundekortet.");
 const card=await s.from("admin_customer_contacts")
  .select("id,name").eq("id",contactId).maybeSingle();
 if(card.error||!card.data||normalized(card.data.name)!==normalized(remote.name))
  throw Error("Kundenavn i Tripletex avviker fra kundekortet. Kontroller og oppdater kundeopplysningene før import.");
 return {contactId,tripletexCustomerId:Number(remote.id),
  tripletexCustomerNumber:Number(remote.customerNumber),
  customerName:String(invoice.customer_name||"").trim()};
}
async function getData(s,id){
 const [invoice,claim]=await Promise.all([
  s.from("external_customer_invoices").select(
   "id,source_system,invoice_number,customer_name,issued_on,due_on,amount_ore,status,sha256")
   .eq("id",id).maybeSingle(),
  s.from("external_invoice_tripletex_imports").select(cols)
   .eq("external_invoice_id",id).maybeSingle()
 ]);
 if(invoice.error||claim.error)throw Error("Fakturaen kunne ikke kontrolleres.");
 return {invoice:invoice.data,claim:claim.data};
}
export async function GET(req){
 const owner=await getAdminUser();
 if(owner?.role!=="owner")return json({error:"Bare eier kan kontrollere Tripletex-import."},403);
 const q=new URL(req.url).searchParams,id=q.get("id");
 if(!uuid(id))return json({error:"Ugyldig faktura-ID."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const {invoice,claim}=await getData(s,id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  if(q.get("format")==="csv"){
   if(!claim)return json({error:"Fakturaen er ikke kontrollert for Tripletex-import."},409);
   const contents=externalTripletexCsv(invoice,claim);
   return new NextResponse(contents,{headers:{
    ...headers,"Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="tripletex-ekstern-faktura-'+claim.import_number+'.csv"',
    "X-Content-Type-Options":"nosniff"
   }});
  }
  const mostRecent=await s.from("external_invoice_tripletex_imports")
   .select("import_number").order("import_number",{ascending:false}).limit(1);
  if(mostRecent.error)return json({error:"Kunne ikke kontrollere siste importnummer."},503);
  const top=Number(mostRecent.data?.[0]?.import_number||89999999);
  const suggestedImportNumber=top>=90000000&&top<999999999?top+1:90000000;
  return json({ok:true,suggestedImportNumber,import:claim?{
   importNumber:claim.import_number,status:claim.status,
   vatRate:claim.vat_rate,baseOre:claim.base_ore,vatOre:claim.vat_ore,
   snapshotPaid:claim.snapshot_paid,
   tripletexInvoiceId:claim.tripletex_invoice_id,
   preparedAt:claim.prepared_at,confirmedAt:claim.confirmed_at
  }:null});
 }catch(e){return json({error:e.message||"Kunne ikke lese Tripletex-importen."},503);}
}
export async function POST(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eier kan klargjøre Tripletex-import."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Importklargjøring er sperret utenfor produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.id)||!["prepare","verify-import"].includes(body.action))
  return json({error:"Ugyldig importhandling."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const {invoice,claim}=await getData(s,body.id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  if(body.action==="prepare"){
   if(claim)return json({
    error:"Denne fakturaen har allerede en import eller en påbegynt import. Den må kontrolleres før en ny import."
   },409);
   const record=validateExternalImport(invoice,body);
   const native=await s.from("invoice_drafts").select("id")
    .eq("invoice_number",invoice.invoice_number).neq("status","draft").limit(1);
   if(native.error)return json({error:"Kunne ikke kontrollere fakturanummer mot Aadland Service."},503);
   if(native.data?.length)return json({
    error:"Fakturanummeret finnes allerede i Aadland Service. Importen er sperret."
   },409);
   const result=await s.from("external_invoice_tripletex_imports").insert({
    external_invoice_id:invoice.id,...record,prepared_by:user.id,status:"prepared"
   }).select("external_invoice_id,import_number").single();
   if(result.error||!result.data)
    return json({error:result.error?.code==="23505"?
     "Dette importnummeret eller denne fakturaen er allerede klargjort. Kontroller Tripletex før nytt forsøk.":
     "Klargjøringen kunne ikke lagres. Ingen bilag er sendt."},409);
   return json({ok:true,status:"prepared",importNumber:result.data.import_number,
    note:"Importfil er klargjort, ikke overført eller bokført i Tripletex."});
  }
  if(!claim||claim.status!=="prepared"||body.confirmed!==true)
   return json({error:"Klargjort import og uttrykkelig bekreftelse kreves."},409);
  // A local payment-status change after CSV preparation is not a safe import.
  externalTripletexCsv(invoice,claim);
  const connection=await storedTripletexConnection(s);
  if(!connection||connection.environment!=="production")
   return json({error:"Koble til Tripletex-produksjon før du bekrefter import."},409);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  const next=nextInvoiceDate(invoice.issued_on);
  if(!next)return json({error:"Fakturadatoen kan ikke kontrolleres."},409);
  const remote=await tripletexRead("/invoice?invoiceDateFrom="+invoice.issued_on+
   "&invoiceDateTo="+next+"&count=1000&fields=id,invoiceNumber,invoiceDate,amount,amountOutstanding,customer,isCreditNote,isCredited",
   session,connection.environment);
  if(!Array.isArray(remote?.values)||remote.values.length>=1000||
   (Number.isFinite(Number(remote?.fullResultSize))&&
    Number(remote.fullResultSize)>remote.values.length))
   return json({error:"Tripletex returnerte en ufullstendig fakturaliste. Ingen import blir bekreftet."},409);
  const found=remote.values.filter(x=>Number(x.invoiceNumber)===Number(claim.import_number));
  if(found.length!==1||!positive(found[0]?.id)||
   String(found[0].invoiceDate).slice(0,10)!==invoice.issued_on||
   nokToOre(found[0].amount)!==Number(invoice.amount_ore)||
   found[0].isCreditNote||found[0].isCredited)
   return json({error:"Importen er ikke entydig funnet med riktig dato, nummer og beløp i Tripletex. Kontroller først under Fakturaoversikt der."},409);
  const updated=await s.from("external_invoice_tripletex_imports").update({
   status:"confirmed",tripletex_invoice_id:Number(found[0].id),
   confirmed_at:new Date().toISOString(),confirmed_by:user.id,updated_at:new Date().toISOString()
  }).eq("external_invoice_id",invoice.id).eq("status","prepared")
   .select("external_invoice_id").maybeSingle();
  if(updated.error||!updated.data)
   return json({error:"Tripletex-fakturaen ble funnet, men statusen ble ikke lagret. Oppdater og kontroller manuelt."},409);
  return json({ok:true,status:"confirmed",importNumber:claim.import_number,
   tripletexInvoiceId:Number(found[0].id),
   note:"Importen er bekreftet mot Tripletex. Original-PDF beholdes i Aadland Service."});
 }catch(e){
  return json({error:String(e.message||"Tripletex-kontrollen feilet.").slice(0,300)},503);
 }
}
