import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../../../lib/auth";
import {db} from "../../../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken}
 from "../../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexUploadVoucherAttachment}
 from "../../../../../../../lib/tripletexApi";
import {vatAttachmentBucket,MAX_VAT_FILE_SIZE}
 from "../../../../../../../lib/vatPurchaseAttachments";
import {nokToOre} from "../../../../../../../lib/tripletexInvoiceReconciliation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const validUuid=id=>typeof id==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):null;
const invoiceFields="id,invoice_number,customer_name,issued_on,amount_ore,sha256,storage_path,original_filename,mime_type,file_size";
const importFields="status,transfer_method,import_number,tripletex_invoice_id,tripletex_invoice_number,tripletex_customer_id,snapshot_gross_ore,snapshot_sha256";
const attachmentFields="external_invoice_id,tripletex_invoice_id,voucher_id,original_sha256,status,confirmed_at";
async function load(s,id){
 const [invoice,imported,attachment]=await Promise.all([
  s.from("external_customer_invoices").select(invoiceFields).eq("id",id).maybeSingle(),
  s.from("external_invoice_tripletex_imports").select(importFields).eq("external_invoice_id",id).maybeSingle(),
  s.from("external_invoice_tripletex_pdf_attachments").select(attachmentFields).eq("external_invoice_id",id).maybeSingle()
 ]);
 if(invoice.error||imported.error||attachment.error)
  throw Error("Kunne ikke lese fakturaens vedleggsstatus.");
 return {invoice:invoice.data,imported:imported.data,attachment:attachment.data};
}
function validateLocal(invoice,imported){
 if(!invoice||!imported||imported.status!=="confirmed"||
  !positive(imported.tripletex_invoice_id)||
  !(positive(imported.tripletex_invoice_number)||positive(imported.import_number))||
  !positive(imported.tripletex_customer_id)||
  invoice.sha256!==imported.snapshot_sha256||
  Number(invoice.amount_ore)!==Number(imported.snapshot_gross_ore))
  throw Error("Fakturaen er ikke entydig bekreftet i Tripletex, eller originalen er endret.");
 if(invoice.mime_type!=="application/pdf"||
  !Number.isSafeInteger(invoice.file_size)||invoice.file_size<12||
  invoice.file_size>MAX_VAT_FILE_SIZE||!/^([a-f0-9]{64})$/.test(invoice.sha256))
  throw Error("Bare en kontrollert original-PDF på maks 4 MB kan legges ved.");
 return Number(imported.tripletex_invoice_id);
}
function verifyRemoteInvoice(value,invoice,imported){
 const invoiceId=validateLocal(invoice,imported);
 if(positive(value?.id)!==invoiceId||
  positive(value?.invoiceNumber)!==(positive(imported.tripletex_invoice_number)||positive(imported.import_number))||
  positive(value?.customer?.id)!==positive(imported.tripletex_customer_id)||
  String(value?.invoiceDate||"").slice(0,10)!==invoice.issued_on||
  nokToOre(value?.amount)!==Number(invoice.amount_ore)||
  (value?.currency?.code&&value.currency.code!=="NOK"))
  throw Error("Tripletex-fakturaen har ikke samme identitet, kunde, dato eller sum som originalen.");
 const voucherId=positive(value?.voucher?.id);
 if(!voucherId)throw Error("Tripletex oppga ingen sikker bilags-ID for denne fakturaen.");
 return voucherId;
}
async function remoteVoucher(session,environment,voucherId){
 const r=await tripletexRead("/ledger/voucher/"+voucherId+
  "?fields=id,attachment,document",session,environment);
 if(positive(r?.value?.id)!==voucherId)
  throw Error("Bilaget i Tripletex kunne ikke identifiseres.");
 return r.value;
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan kontrollere originalvedlegg."},403);
 const id=new URL(req.url).searchParams.get("id");
 if(!validUuid(id))return json({error:"Ugyldig faktura-ID."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const {invoice,imported,attachment}=await load(s,id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  let eligible=true,reason="";
  try{validateLocal(invoice,imported);}catch(e){eligible=false;reason=e.message;}
  return json({ok:true,eligible,reason,
   state:attachment?.status||"not_uploaded",
   voucherId:attachment?.voucher_id||null,
   confirmedAt:attachment?.confirmed_at||null,
   originalFilename:invoice.original_filename,
   alreadyUploaded:attachment?.status==="confirmed"});
 }catch(e){return json({error:String(e.message).slice(0,220)},503);}
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eier kan legge ved fakturaoriginalen."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Opplasting til Tripletex er sperret utenfor produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(!validUuid(body?.id)||body.action!=="attach-original-pdf"||
  body.confirmed!==true||body.checkedTripletex!==true)
  return json({error:"Bekreft at original-PDF skal legges på det eksisterende Tripletex-bilaget."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false;
 try{
  const {invoice,imported,attachment}=await load(s,body.id);
  if(!invoice)return json({error:"Fakturaen finnes ikke."},404);
  if(attachment)return json({error:attachment.status==="confirmed"?
   "Original-PDF er allerede bekreftet vedlagt. Den kan ikke legges ved to ganger.":
   "Tidligere vedleggsforsøk må kontrolleres manuelt i Tripletex. Automatisk gjentakelse er sperret."},409);
  const id=validateLocal(invoice,imported);
  const obj=await s.storage.from(vatAttachmentBucket).download(invoice.storage_path);
  if(obj.error||!obj.data)throw Error("Original-PDF kunne ikke leses fra privat lagring.");
  const bytes=Buffer.from(await obj.data.arrayBuffer());
  if(bytes.length!==invoice.file_size||
   crypto.createHash("sha256").update(bytes).digest("hex")!==invoice.sha256||
   bytes.subarray(0,5).toString()!=="%PDF-")
   throw Error("Originalfilens størrelse, signatur eller SHA-256 stemmer ikke.");
  const connection=await storedTripletexConnection(s);
  if(!connection||connection.environment!=="production")
   throw Error("Tripletex-produksjon er ikke tilkoblet.");
  const session=await tripletexOpenSession(unprotectTripletexToken(connection),
   connection.environment);
  const remote=await tripletexRead("/invoice/"+id+
   "?fields=id,invoiceNumber,invoiceDate,customer,amount,currency,voucher",
   session,connection.environment);
  const voucherId=verifyRemoteInvoice(remote?.value,invoice,imported);
  const voucherBefore=await remoteVoucher(session,connection.environment,voucherId);
  if(voucherBefore.attachment?.id)
   return json({error:"Tripletex-bilaget har allerede et vedlegg. Kontroller innholdet manuelt før noe lastes opp."},409);
  // Unique claim is written BEFORE multipart POST. Any uncertain upload result
  // is locked for manual review, never retried and never rebooks an invoice.
  const lock=await s.from("external_invoice_tripletex_pdf_attachments").insert({
   external_invoice_id:invoice.id,tripletex_invoice_id:id,
   voucher_id:voucherId,original_sha256:invoice.sha256,
   status:"uploading",uploaded_by:user.id
  }).select("external_invoice_id").maybeSingle();
  if(lock.error||!lock.data)
   return json({error:"En opplasting er allerede startet. Oppdater og kontroller Tripletex før videre handling."},409);
  claimed=true;
  const fresh=await load(s,invoice.id);
  if(fresh.invoice?.sha256!==invoice.sha256||
   fresh.imported?.status!=="confirmed"||
   Number(fresh.imported.tripletex_invoice_id)!==id||
   fresh.attachment?.status!=="uploading"||
   fresh.invoice.storage_path!==invoice.storage_path)
   throw Error("Fakturaen ble endret etter at PDF-opplastingen var låst.");
  const safeNumber=String(invoice.invoice_number||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,40);
  await tripletexUploadVoucherAttachment(voucherId,bytes,
   "originalfaktura-"+(safeNumber||"ekstern")+".pdf",session,connection.environment);
  const voucherAfter=await remoteVoucher(session,connection.environment,voucherId);
  if(!positive(voucherAfter.attachment?.id))
   throw Error("PDF ble sendt, men dokumentkoblingen kunne ikke bekreftes i Tripletex.");
  const saved=await s.from("external_invoice_tripletex_pdf_attachments").update({
   status:"confirmed",confirmed_at:new Date().toISOString()
  }).eq("external_invoice_id",invoice.id).eq("status","uploading")
   .select("external_invoice_id").maybeSingle();
  if(saved.error||!saved.data)
   throw Error("PDF ble vedlagt i Tripletex, men lokal status er uavklart.");
  return json({ok:true,status:"confirmed",voucherId,
   message:"Original-PDF er vedlagt det eksisterende Tripletex-bilaget. Faktura og betaling er ikke sendt eller bokført på nytt."});
 }catch(e){
  if(claimed)await s.from("external_invoice_tripletex_pdf_attachments")
   .update({status:"needs_review"}).eq("external_invoice_id",body.id)
   .eq("status","uploading");
  return json({error:claimed?
   "Opplastingsresultatet er uavklart. Kontroller vedlegget på bilaget i Tripletex. Ikke trykk last opp på nytt.":
   String(e.message||"PDF-kontrollen mislyktes.").slice(0,240)},claimed?409:503);
 }
}
