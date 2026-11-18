import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../../../lib/auth";
import {db} from "../../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../../lib/requestGuard";
import {osloDateKey} from "../../../../../../../lib/osloTime";
import {summarizeInvoiceActivity} from "../../../../../../../lib/invoiceSettlementInfo";
import {salesInvoiceExportOverview,tripletexSalesInvoiceCsv,auditInvoicePaymentEntries} from "../../../../../../../lib/tripletexSalesInvoiceExport";
import {validateTripletexImportNumber,tripletexPaymentTypeFor} from "../../../../../../../lib/tripletexCustomerInvoiceQueue";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const transferFields="id,invoice_id,import_number,batch_id,status,original_invoice_number,original_issued_date,snapshot_gross_ore,snapshot_paid_ore,payment_source,payment_type_import_id,prepared_at,confirmed_at";
const invoiceFields="id,status,invoice_number,customer,line_items,issued_date,issued_at,due_date,sent_at,paid_ore,credited_ore,pdf_base64";

async function all(s,table,columns,filter=null){
 const out=[];
 for(let offset=0;offset<5000;offset+=250){
  let q=s.from(table).select(columns).order("id",{ascending:true}).range(offset,offset+249);
  if(filter)q=filter(q);
  const r=await q;
  if(r.error||!Array.isArray(r.data))throw Error("Kunne ikke hente komplett faktura-/overføringshistorikk.");
  out.push(...r.data);
  if(r.data.length<250)return out;
 }
 throw Error("Over 5000 bilag. Kontakt support før eksport.");
}
async function issued(s){
 const invoices=await all(s,"invoice_drafts",invoiceFields,q=>q.eq("status","sent"));
 const payments=[],notes=[],recorded=[];
 for(let offset=0;offset<invoices.length;offset+=100){
  const ids=invoices.slice(offset,offset+100).map(x=>x.id);
  const [p,n,r]=await Promise.all([
   all(s,"invoice_vipps_payments","id,invoice_id,state,captured_ore,refunded_ore",q=>q.in("invoice_id",ids)),
   all(s,"invoice_credit_notes","id,invoice_id,total_ore,sent_at",q=>q.in("invoice_id",ids)),
   all(s,"invoice_payments","id,invoice_id,amount_ore,reversed_at,vipps_reference",q=>q.in("invoice_id",ids))
  ]);
  payments.push(...p);notes.push(...n);recorded.push(...r);
 }
 const byId=new Map();
 for(const entry of recorded){
  if(!byId.has(entry.invoice_id))byId.set(entry.invoice_id,[]);
  byId.get(entry.invoice_id).push(entry);
 }
 return summarizeInvoiceActivity(invoices,payments,notes).map(invoice=>({
  ...invoice,paymentAudit:auditInvoicePaymentEntries(invoice,byId.get(invoice.id)||[])
 }));
}
async function validOwner(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return {error:json({error:"Kun eier har tilgang til Tripletex-overføringer."},403)};
 if(req.method==="POST"){
  const guard=sameOriginGuard(req);
  if(guard)return {error:guard};
  if(process.env.VERCEL_ENV!=="production")
   return {error:json({error:"Fakturaoverføringer er deaktivert i forhåndsvisning."},403)};
 }
 return {user};
}

export async function GET(req){
 const auth=await validOwner(req);
 if(auth.error)return auth.error;
 const url=new URL(req.url);
 const format=url.searchParams.get("format")||"status";
 if(!["status","csv"].includes(format))return json({error:"Ukjent eksportvalg."},400);
 const s=db();if(!s)return json({error:"Databasen kan ikke nås."},503);
 try{
  const transfers=await all(s,"invoice_tripletex_transfers",transferFields);
  if(format==="status")return json({ok:true,transfers:transfers.map(x=>({
   invoice_id:x.invoice_id,status:x.status,import_number:x.import_number,
   batch_id:x.batch_id,prepared_at:x.prepared_at,confirmed_at:x.confirmed_at,
   original_invoice_number:x.original_invoice_number
  }))});
  const batchId=url.searchParams.get("batchId");
  if(!uuid(batchId))return json({error:"Ugyldig eksportreferanse."},400);
  const batchRows=transfers.filter(x=>x.batch_id===batchId);
  if(!batchRows.length)return json({error:"Fant ingen klargjort fakturaimport."},404);
  // If only some rows were imported, a second download must NEVER include
  // already-confirmed invoices. This prevents duplicate booking in Tripletex.
  const selected=batchRows.filter(x=>x.status==="prepared");
  if(!selected.length)return json({
   error:"Alle fakturaene i denne importen er allerede bekreftet importert. Ingen ny importfil er tilgjengelig."
  },409);
  if(selected.length>100)return json({error:"For mange fakturaer i eksporten."},409);
  const rows=salesInvoiceExportOverview(await issued(s),osloDateKey(new Date())).rows;
  const byId=new Map(rows.map(x=>[x.invoice.id,x]));
  const numbers={},paymentTypes={};
  for(const t of selected){
   const row=byId.get(t.invoice_id);
   if(!row||!["paid","unpaid"].includes(row.state)||
    row.invoice.invoice_number!==t.original_invoice_number||
    row.invoice.issued_date!==t.original_issued_date||
    row.payment.gross!==Number(t.snapshot_gross_ore)||
    row.payment.paid!==Number(t.snapshot_paid_ore))
    return json({error:"Fakturainnholdet eller betalingsstatus er endret etter klargjøring. Eksporten er stoppet for å unngå feil i Tripletex. Kontroller fakturaen."},409);
   numbers[t.invoice_id]=Number(t.import_number);
   if(t.payment_type_import_id)paymentTypes[t.invoice_id]=t.payment_type_import_id;
  }
  const overview={rows:rows.filter(row=>Object.prototype.hasOwnProperty.call(numbers,row.invoice.id))};
  const exported=tripletexSalesInvoiceCsv(overview,{
   startNumber:Math.min(...selected.map(x=>Number(x.import_number))),
   includePaid:true,selectedImportNumbers:numbers,selectedPaymentTypes:paymentTypes
  });
  if(exported.accepted.length!==selected.length)
   return json({error:"Ikke alle fakturaer kan importeres med de lagrede opplysningene."},409);
  return new NextResponse(exported.csv,{headers:{
   ...headers,"Content-Type":"text/csv; charset=utf-8",
   "Content-Disposition":'attachment; filename="Tripletex-kundefakturaer-'+batchId.slice(0,8)+'.csv"',
   "X-Content-Type-Options":"nosniff"
  }});
 }catch(error){
  console.error("TRIPLETEX CUSTOMER INVOICE GET",error?.message);
  return json({error:"Kunne ikke lage en komplett og sikker fakturaimport. Ingen regnskapsdata er endret."},503);
 }
}

export async function POST(req){
 const auth=await validOwner(req);
 if(auth.error)return auth.error;
 const user=auth.user;
 const body=await req.json().catch(()=>({}));
 if(!["prepare","confirm"].includes(body.action))return json({error:"Ukjent handling."},400);
 const ids=Array.isArray(body.invoiceIds)?body.invoiceIds:
  body.invoiceId?[body.invoiceId]:[];
 if(ids.length<1||ids.length>100||ids.some(id=>!uuid(id))||
  new Set(ids).size!==ids.length)
  return json({error:"Velg mellom 1 og 100 forskjellige fakturaer."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  if(body.action==="prepare"){
   const start=validateTripletexImportNumber(body.startNumber);
   if(start===null||start+ids.length-1>999999999)
    return json({error:"Velg ledige numeriske fakturanumre for Tripletex."},400);
   const history=await all(s,"invoice_tripletex_transfers",transferFields);
   if(ids.some(id=>history.some(t=>t.invoice_id===id)))
    return json({error:"En eller flere fakturaer er allerede klargjort eller markert importert. Åpne eksisterende import i listen for å unngå duplikater."},409);
   const reserved=new Set(history.map(t=>Number(t.import_number)));
   if(ids.some((id,index)=>reserved.has(start+index)))
    return json({error:"Et av importnumrene er allerede brukt av Aadland Service. Velg et annet, ledig intervall."},409);
   const rows=salesInvoiceExportOverview(await issued(s),osloDateKey(new Date())).rows;
   const byId=new Map(rows.map(x=>[x.invoice.id,x]));
   const batchId=crypto.randomUUID(),newRows=[];
   for(const [index,id] of ids.entries()){
    const row=byId.get(id);
    if(!row||!["unpaid","paid"].includes(row.state))
     return json({error:"Denne fakturaen krever kontroll før overføring: "+(row?.reason||"Finnes ikke som utsendt faktura.")},409);
    const paymentType=tripletexPaymentTypeFor(row,
     String(body.paymentTypeVipps||"").trim(),String(body.paymentTypeOther||"").trim());
    newRows.push({
     invoice_id:id,import_number:start+index,batch_id:batchId,status:"prepared",
     original_invoice_number:row.invoice.invoice_number,
     original_issued_date:row.invoice.issued_date,
     snapshot_gross_ore:row.payment.gross,snapshot_paid_ore:row.payment.paid,
     payment_source:row.paymentSource||"none",
     payment_type_import_id:paymentType,prepared_by:user.id
    });
   }
   // Validate the CSV before reserving anything in the database.
   const numbers=Object.fromEntries(newRows.map(x=>[x.invoice_id,x.import_number]));
   const types=Object.fromEntries(newRows.filter(x=>x.payment_type_import_id).map(x=>[x.invoice_id,x.payment_type_import_id]));
   const picked={rows:rows.filter(x=>Object.prototype.hasOwnProperty.call(numbers,x.invoice.id))};
   const checked=tripletexSalesInvoiceCsv(picked,{
    startNumber:start,includePaid:true,selectedImportNumbers:numbers,selectedPaymentTypes:types
   });
   if(checked.accepted.length!==newRows.length)
    return json({error:"Fakturaimporten var ufullstendig. Ingen overføring er klargjort."},409);
   const inserted=await s.from("invoice_tripletex_transfers").insert(newRows)
    .select("invoice_id,import_number,batch_id,status");
   if(inserted.error||inserted.data?.length!==newRows.length)
    return json({error:"Fakturaen er kanskje allerede klargjort av en annen innlogging. Oppdater listen før du forsøker igjen."},409);
   return json({ok:true,status:"prepared",batchId,invoiceIds:ids,
    downloadUrl:"/api/admin/invoices/tripletex/sales/transfer?format=csv&batchId="+batchId,
    message:"Importfilen er klargjort. Den er IKKE importert i Tripletex ennå. Kontroller importen der før du markerer den fullført."});
  }
  // Re-check the exact import numbers the owner saw in Tripletex's invoice list.
  if(body.confirmed!==true||!Array.isArray(body.importNumbers)||
    body.importNumbers.length!==ids.length)
   return json({error:"Du må bekrefte importen og de nøyaktige Tripletex-fakturanumrene."},400);
  const rows=await all(s,"invoice_tripletex_transfers",transferFields,q=>q.in("invoice_id",ids));
  if(rows.length!==ids.length||rows.some(t=>t.status!=="prepared")||
   ids.some((id,index)=>{
    const t=rows.find(x=>x.invoice_id===id);
    return !t||Number(t.import_number)!==validateTripletexImportNumber(body.importNumbers[index]);
   }))
   return json({error:"Numrene stemmer ikke, eller fakturaen er allerede bekreftet. Ingen status er endret."},409);
  const result=await s.from("invoice_tripletex_transfers").update({
   status:"confirmed",confirmed_at:new Date().toISOString(),confirmed_by:user.id
  }).in("invoice_id",ids).eq("status","prepared")
   .select("invoice_id,status");
  if(result.error||result.data?.length!==ids.length)
   return json({error:"Bekreftelsen kunne ikke lagres for alle fakturaene. Oppdater listen og kontroller status."},409);
  return json({ok:true,status:"confirmed",count:ids.length,
   message:"Fakturaene er flyttet til historikken etter at du bekreftet importen i Tripletex."});
 }catch(error){
  console.error("TRIPLETEX CUSTOMER INVOICE ACTION",error?.message);
  if(error?.message?.startsWith("Oppgi riktig Tripletex Import-ID"))
   return json({error:error.message},400);
  return json({error:"Kunne ikke fullføre handlingen. Ingen fakturaer er sendt til kunden eller bokført av Aadland Service."},503);
 }
}
