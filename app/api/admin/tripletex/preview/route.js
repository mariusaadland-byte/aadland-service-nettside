import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {osloDateKey} from "../../../../../lib/osloTime";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../lib/tripletexApi";
import {previewTripletexInvoice} from "../../../../../lib/tripletexInvoiceMapping";
import {summarizeInvoiceActivity} from "../../../../../lib/invoiceSettlementInfo";
import {salesInvoiceExportOverview,auditInvoicePaymentEntries} from "../../../../../lib/tripletexSalesInvoiceExport";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const columns="id,status,invoice_number,customer,line_items,issued_date,issued_at,due_date,sent_at,paid_ore,credited_ore,pdf_base64";
const isUuid=s=>typeof s==="string"&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(s);
async function getRows(s,table,cols,filter){
 let query=s.from(table).select(cols).order("id",{ascending:true}).range(0,999);
 if(filter)query=filter(query);
 const result=await query;
 if(result.error||!Array.isArray(result.data))throw Error("Kunne ikke hente fakturaopplysningene.");
 if(result.data.length===1000)throw Error("For mange fakturaer å forhåndskontrollere.");
 return result.data;
}
async function invoiceItems(s,ids){
 const [invoices,vipps,credits,payments]=await Promise.all([
  getRows(s,"invoice_drafts",columns,q=>q.in("id",ids).eq("status","sent")),
  getRows(s,"invoice_vipps_payments","id,invoice_id,state,captured_ore,refunded_ore",q=>q.in("invoice_id",ids)),
  getRows(s,"invoice_credit_notes","id,invoice_id,total_ore,sent_at",q=>q.in("invoice_id",ids)),
  getRows(s,"invoice_payments","id,invoice_id,amount_ore,reversed_at,vipps_reference",q=>q.in("invoice_id",ids))
 ]);
 const byId=new Map();
 for(const entry of payments){
  if(!byId.has(entry.invoice_id))byId.set(entry.invoice_id,[]);
  byId.get(entry.invoice_id).push(entry);
 }
 const enriched=summarizeInvoiceActivity(invoices,vipps,credits).map(i=>({
  ...i,paymentAudit:auditInvoicePaymentEntries(i,byId.get(i.id)||[])
 }));
 return salesInvoiceExportOverview(enriched,osloDateKey(new Date())).rows;
}
export async function POST(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere Tripletex-fakturaer."},403);
 const guard=sameOriginGuard(req);if(guard)return guard;
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Forhåndskontroll er bare tilgjengelig på publisert nettsted."},403);
 const body=await req.json().catch(()=>({}));
 const ids=Array.isArray(body.invoiceIds)?body.invoiceIds:[];
 if(!ids.length||ids.length>20||ids.some(id=>!isUuid(id))||new Set(ids).size!==ids.length)
  return json({error:"Velg mellom én og 20 fakturaer."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Koble til Tripletex API før forhåndskontrollen."},409);
  const transfers=await getRows(s,"invoice_tripletex_transfers",
   "invoice_id,status,original_invoice_number",q=>q.in("invoice_id",ids));
  const items=await invoiceItems(s,ids);
  const byId=new Map(items.map(x=>[x.invoice.id,x]));
  // Customer links are tied to the original Aadland contact ID, not an e-mail address.
  const contactIds=[...new Set(items.map(x=>x.invoice.customer?.contactId).filter(isUuid))];
  const linksResult=contactIds.length?
   await s.from("tripletex_customer_links")
    .select("source_id,status,tripletex_customer_id")
    .eq("source_type","contact").eq("environment",connection.environment)
    .eq("status","linked").in("source_id",contactIds):
   {data:[],error:null};
  if(linksResult.error)throw Error("Kunne ikke lese kundekoblingene fra Tripletex.");
  const customerLinks=new Map((linksResult.data||[]).map(x=>[x.source_id,Number(x.tripletex_customer_id)]));
  const session=await tripletexOpenSession(unprotectTripletexToken(connection),connection.environment);
  const [vatResult,paymentTypeResult]=await Promise.all([
   tripletexRead("/ledger/vatType?count=500&typeOfVat=OUTGOING",session,connection.environment),
   tripletexRead("/invoice/paymentType?count=100",session,connection.environment)
  ]);
  const vatTypes=Array.isArray(vatResult.values)?vatResult.values:[];
  const payments=Array.isArray(paymentTypeResult.values)?paymentTypeResult.values:[];
  const results=[];
  for(const id of ids){
   const found=byId.get(id);
   if(transfers.some(t=>t.invoice_id===id)){
    results.push({id,ready:false,reason:"Fakturaen finnes allerede i CSV-overføringsloggen. Ikke overfør på nytt før avstemming."});
    continue;
   }
   if(!found){
    results.push({id,ready:false,reason:"Fakturaen mangler, eller er ikke utstedt."});
    continue;
   }
   if(!["paid","unpaid"].includes(found.state)){
    results.push({id,ready:false,reason:found.reason||"Fakturaen krever kontroll."});
    continue;
   }
   const customer=found.invoice.customer||{};
   const org=String(customer.organizationNumber||"").replace(/\D/g,"");
   const email=String(customer.email||"").trim();
   const linkedId=customerLinks.get(customer.contactId)||null;
   if(!linkedId&&!org&&!email){
    results.push({id,ready:false,reason:"Kunden har ingen lagret Tripletex-kobling. Overfør kunden fra kundelisten først."});
    continue;
   }
   const search=org?"organizationNumber="+encodeURIComponent(org):
    "email="+encodeURIComponent(email);
   const matches=linkedId?{values:[]}:
    await tripletexRead("/customer?"+search+"&count=50",session,connection.environment);
   const preview=previewTripletexInvoice(found,Array.isArray(matches.values)?matches.values:[],vatTypes,linkedId);
   results.push({id,ready:preview.ready,
    originalNumber:found.invoice.invoice_number,
    reason:preview.ready?(preview.needsPaymentMapping?
     "Kunde og MVA er mappet. Betalingsmetode og faktisk betalingsdato må avstemmes før direktesending.":
     "Kunde og MVA er mappet. Kontroller at fakturaen ikke allerede finnes i Tripletex.") : preview.reason,
    customerId:preview.customerId||null,
    needsPaymentMapping:preview.needsPaymentMapping||false});
  }
  return json({ok:true,environment:connection.environment,
   checked:results.length,ready:results.filter(x=>x.ready).length,
   paymentTypes:payments.map(x=>({id:x.id,name:String(x.name||x.description||"Betalingstype").slice(0,100)}))
    .filter(x=>Number.isSafeInteger(Number(x.id))&&Number(x.id)>0).slice(0,100),
   results,doesNotCreateInvoices:true});
 }catch(error){
  const remote=error?.name==="TripletexApiError";
  return json({error:remote?error.message:
   "Forhåndskontroll mot Tripletex feilet. Ingen fakturaer er opprettet."},remote?409:503);
 }
}
