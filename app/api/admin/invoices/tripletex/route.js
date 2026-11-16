import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {Resend} from "resend";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {vatAttachmentBucket,MAX_VAT_FILE_SIZE} from "../../../../../lib/vatPurchaseAttachments";
import {normalizeTripletexInbox,tripletexReceiptEmail,tripletexReceiptCsv} from "../../../../../lib/tripletexReceiptTransfer";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const uuid=v=>typeof v==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const filesTable="vat_purchase_document_files";
const transfersTable="vat_tripletex_receipt_transfers";
const docColumns="id,supplier_name,supplier_document_number,document_date,kind,original_document_number,evidence_reference,business_purpose,vat_groups,deduction_percent,base_ore,vat_ore,deductible_vat_ore,voided_at";
const fileColumns="id,purchase_document_id,original_filename,mime_type,file_size,sha256,storage_path,uploaded_at";
const sendColumns="purchase_document_id,recipient,status,attempted_at,accepted_at,provider_message_id";

async function entireTable(s,table,columns,extra){
 const all=[];
 for(let offset=0;offset<5000;offset+=250){
  let query=s.from(table).select(columns).order("id",{ascending:true}).range(offset,offset+249);
  if(extra)query=extra(query);
  const result=await query;
  if(result.error||!Array.isArray(result.data))
   throw Error("Kunne ikke hente fullstendig bilagsliste.");
  all.push(...result.data);
  if(result.data.length<250)return all;
 }
 throw Error("Flere enn 5000 bilag. Del opp eksporten før bruk.");
}

async function listReceipts(s){
 const [docs,files,transfers]=await Promise.all([
  entireTable(s,"vat_purchase_documents",docColumns,q=>q.is("voided_at",null)),
  entireTable(s,filesTable,fileColumns),
  entireTable(s,transfersTable,sendColumns)
 ]);
 const byFile=new Map(files.map(f=>[f.purchase_document_id,f]));
 const byTransfer=new Map(transfers.map(t=>[t.purchase_document_id,t]));
 return docs.map(document=>({
  document,
  attachment:byFile.get(document.id)||null,
  transfer:byTransfer.get(document.id)||null
 })).sort((a,b)=>a.document.document_date.localeCompare(b.document.document_date)||
  a.document.supplier_name.localeCompare(b.document.supplier_name));
}
const summary=rows=>({
 total:rows.length,
 withOriginal:rows.filter(row=>row.attachment).length,
 missingOriginal:rows.filter(row=>!row.attachment).length,
 acceptedByEmailProvider:rows.filter(row=>row.transfer?.status==="accepted").length,
 requiresReview:rows.filter(row=>row.transfer&&row.transfer.status!=="accepted").length,
 notSent:rows.filter(row=>!row.transfer).length,
 // This is only metadata; original files remain behind the existing owner-only download API.
 totalBytes:rows.reduce((sum,row)=>sum+Number(row.attachment?.file_size||0),0)
});

export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eieren kan se overføring av regnskapsbilag."},403);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const rows=await listReceipts(s);
  if(new URL(req.url).searchParams.get("format")==="csv")
   return new NextResponse(tripletexReceiptCsv(rows),{headers:{
    ...headers,"Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="Aadland-Tripletex-bilagsoversikt.csv"',
    "X-Content-Type-Options":"nosniff"
   }});
  return json({ok:true,summary:summary(rows),
   rows:rows.map(({document,attachment,transfer})=>({
    document,attachment:attachment?{
     id:attachment.id,original_filename:attachment.original_filename,
     mime_type:attachment.mime_type,file_size:attachment.file_size,
     sha256:attachment.sha256,uploaded_at:attachment.uploaded_at
    }:null,transfer:transfer?{
     recipient:transfer.recipient,status:transfer.status,
     attempted_at:transfer.attempted_at,accepted_at:transfer.accepted_at
    }:null
   }))});
 }catch(error){
  console.error("TRIPLETEX RECEIPT LIST",error.message);
  return json({error:"Kunne ikke hente komplett overføringsoversikt. Ingen bilag er sendt."},503);
 }
}

// User action ONLY. A separate request sends one exact original at a time.
// The unique audit row is created BEFORE contacting the email provider so that
// interrupted/ambiguous sends never silently produce duplicate receipts.
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan sende bilag til Tripletex."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Overføring er deaktivert på testversjoner."},403);
 const input=await req.json().catch(()=>({}));
 const recipient=normalizeTripletexInbox(input.recipient);
 if(input.action!=="send-document"||!uuid(input.documentId)||!recipient||
  input.confirmed!==true||input.recipientConfirmation!==recipient)
  return json({error:"Velg ett gyldig bilag og bekreft den eksakte e-bilagsadressen fra Tripletex."},400);
 if(!process.env.RESEND_API_KEY)return json({error:"E-posttjenesten er ikke konfigurert."},503);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);

 const [docResult,fileResult,priorResult]=await Promise.all([
  s.from("vat_purchase_documents").select(docColumns)
   .eq("id",input.documentId).is("voided_at",null).maybeSingle(),
  s.from(filesTable).select(fileColumns).eq("purchase_document_id",input.documentId).maybeSingle(),
  s.from(transfersTable).select(sendColumns).eq("purchase_document_id",input.documentId).maybeSingle()
 ]);
 if(docResult.error||fileResult.error||priorResult.error)
  return json({error:"Kunne ikke kontrollere bilag, originalfil og sendestatus."},503);
 const document=docResult.data,attachment=fileResult.data;
 if(!document||!attachment)
  return json({error:"Bilaget eller originalvedlegget mangler og kan ikke sendes."},409);
 if(priorResult.data)return json({
  error:"Det finnes allerede et sendeforsøk for dette bilaget. Kontroller Tripletex og sendeloggen før eventuell ny overføring.",
  state:priorResult.data.status
 },409);
 if(!["application/pdf","image/jpeg","image/png"].includes(attachment.mime_type))
  return json({error:"Originalen har et format Tripletex ikke tar imot. Konverter til PDF/JPG/PNG før overføring."},409);
 if(Number(attachment.file_size)>MAX_VAT_FILE_SIZE||Number(attachment.file_size)<12)
  return json({error:"Originalfilens størrelse er ugyldig."},409);
 const stored=await s.storage.from(vatAttachmentBucket).download(attachment.storage_path);
 if(stored.error||!stored.data)
  return json({error:"Originalfilen kunne ikke hentes. Ingen e-post er sendt."},503);
 const buffer=Buffer.from(await stored.data.arrayBuffer());
 if(buffer.length!==Number(attachment.file_size)||
    crypto.createHash("sha256").update(buffer).digest("hex")!==attachment.sha256)
  return json({error:"Originalen stemmer ikke med lagret kontrollsum. Ingen e-post er sendt."},409);
 let message;
 try{message=tripletexReceiptEmail(document,attachment,recipient);}
 catch(error){return json({error:error.message},409);}

 // The DB unique constraint protects against concurrent requests and retries.
 const claim=await s.from(transfersTable).insert({
  purchase_document_id:document.id,recipient,status:"sending",initiated_by:user.id
 }).select("id").single();
 if(claim.error||!claim.data)return json({
  error:"Bilaget er allerede forsøkt overført eller sendingen er låst. Kontroller status før nytt forsøk."
 },409);
 try{
  const response=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   replyTo:"post@aadland-service.no",
   to:message.to,subject:message.subject,text:message.text,
   attachments:[{filename:attachment.original_filename,content:buffer.toString("base64")}]
  },{idempotencyKey:"aadland-tripletex-"+document.id+"-"+attachment.sha256.slice(0,12)});
  if(response.error||!response.data?.id)
   throw Error("E-posttjenesten bekreftet ikke mottak.");
  const saved=await s.from(transfersTable).update({
   status:"accepted",accepted_at:new Date().toISOString(),
   provider_message_id:response.data.id,last_error:null
  }).eq("id",claim.data.id).eq("status","sending").select("id").maybeSingle();
  if(saved.error||!saved.data)throw Error("Status kunne ikke lagres etter sendingsbekreftelse.");
  return json({ok:true,id:document.id,recipient,
   status:"accepted",
   message:"E-postleverandøren har akseptert bilaget. Kontroller at det vises i Tripletex før bokføring."});
 }catch(error){
  console.error("TRIPLETEX INBOX SEND REQUIRES REVIEW",{
   purchaseDocumentId:document.id,reason:error?.message
  });
  // Never retry automatically: the email may have arrived despite a timeout.
  await s.from(transfersTable).update({
   status:"needs_review",last_error:String(error?.message||"Uklar sendestatus").slice(0,300)
  }).eq("id",claim.data.id).eq("status","sending");
  return json({error:"Sendestatus er usikker. Kontroller bilagsmottaket i Tripletex og Resend før du forsøker videre. Bilaget sendes ikke automatisk på nytt.",state:"needs_review"},502);
 }
}
