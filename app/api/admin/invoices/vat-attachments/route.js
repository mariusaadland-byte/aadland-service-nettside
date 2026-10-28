import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {vatAttachmentBucket,MAX_VAT_FILE_SIZE,inspectVatAttachment,vatAttachmentDownloadName} from "../../../../../lib/vatPurchaseAttachments";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(error,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
const validUser=async()=>{const user=await getAdminUser();return user?.role==="owner"?user:null};
const metadataFields="id,purchase_document_id,original_filename,mime_type,file_size,sha256,uploaded_at";
const confirmedAttachment=data=>({
 id:data.id,filename:data.original_filename,
 mimeType:data.mime_type,fileSize:data.file_size,uploadedAt:data.uploaded_at
});
const sameOriginal=(existing,checked)=>Boolean(existing&&
 existing.sha256===checked.sha256&&existing.original_filename===checked.filename&&
 existing.mime_type===checked.mimeType&&Number(existing.file_size)===checked.fileSize);

export async function GET(req){
 if(!await validUser())return fail("Bare eieren kan åpne originale leverandørbilag.",403);
 const url=new URL(req.url);
 const documentId=url.searchParams.get("documentId");
 if(!uuid(documentId))return fail("Velg et gyldig leverandørbilag.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const {data,error}=await s.from("vat_purchase_document_files")
  .select(metadataFields+",storage_path").eq("purchase_document_id",documentId).maybeSingle();
 if(error)return fail("Kunne ikke hente dokumentstatus.",503);
 if(url.searchParams.get("download")==="1"){
  if(!data)return fail("Det er ikke lastet opp noe originalbilag.",404);
  const saved=await s.storage.from(vatAttachmentBucket).download(data.storage_path);
  if(saved.error||!saved.data)return fail("Det lagrede dokumentet kan ikke hentes.",503);
  const bytes=Buffer.from(await saved.data.arrayBuffer());
  if(bytes.length!==Number(data.file_size)||bytes.length>MAX_VAT_FILE_SIZE||
   crypto.createHash("sha256").update(bytes).digest("hex")!==data.sha256)
   return fail("Filens innhold stemmer ikke med lagret original. Kontakt administrator.",409);
  const filename=vatAttachmentDownloadName(data.original_filename);
  return new NextResponse(bytes,{headers:{
   "Content-Type":data.mime_type,
   "Content-Disposition":'attachment; filename="'+filename+'"',
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"default-src 'none'; sandbox"
  }});
 }
 return NextResponse.json({attachment:data?{
  id:data.id,filename:data.original_filename,mimeType:data.mime_type,
  fileSize:data.file_size,uploadedAt:data.uploaded_at
 }:null},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await validUser();
 if(!user)return fail("Bare eieren kan laste opp leverandørbilag.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Originalbilag kan bare lastes opp fra produksjonssiden.",403);
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>MAX_VAT_FILE_SIZE+65536)return fail("Filen er større enn maks 4 MB.",413);
 let form;
 try{form=await req.formData()}catch{return fail("Kunne ikke lese opplastingsskjemaet.");}
 const documentId=form.get("documentId");
 const file=form.get("file");
 if(!uuid(documentId)||!file||typeof file.arrayBuffer!=="function")
  return fail("Velg registrert bilag og en PDF eller et bilde.");
 if(file.size>MAX_VAT_FILE_SIZE||file.size<12)return fail("Filen må være maks 4 MB.",413);
 let buffer,checked;
 try{
  buffer=Buffer.from(await file.arrayBuffer());
  checked=inspectVatAttachment(buffer,file.type,file.name);
 }catch(e){return fail(e.message);}
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const [purchase,existing]=await Promise.all([
  s.from("vat_purchase_documents").select("id,voided_at")
   .eq("id",documentId).maybeSingle(),
  s.from("vat_purchase_document_files").select(metadataFields)
   .eq("purchase_document_id",documentId).maybeSingle()
 ]);
 if(purchase.error||existing.error)return fail("Bilaget kunne ikke kontrolleres.",503);
 if(!purchase.data||purchase.data.voided_at)return fail("Kun et aktivt, registrert leverandørbilag kan få et vedlegg.",409);
 if(existing.data){
  // A lost network response after a successful upload must be safe to retry.
  // The same bytes/name/type are already stored. Never write a duplicate.
  if(sameOriginal(existing.data,checked))
   return NextResponse.json({ok:true,alreadyUploaded:true,attachment:confirmedAttachment(existing.data)},
    {status:200,headers:{"Cache-Control":"private, no-store"}});
  return fail("Dette bilaget har allerede et annet låst originalvedlegg. Opphev feilregistreringen og opprett nytt bilag ved behov.",409);
 }
 const path="vat-purchases/"+documentId+"/"+crypto.randomUUID()+"."+checked.ext;
 const uploaded=await s.storage.from(vatAttachmentBucket)
  .upload(path,buffer,{contentType:checked.mimeType,upsert:false,cacheControl:"0"});
 if(uploaded.error)return fail("Filen kunne ikke lagres sikkert.",503);
 const saved=await s.from("vat_purchase_document_files").insert({
  purchase_document_id:documentId,storage_path:path,
  original_filename:checked.filename,mime_type:checked.mimeType,
  file_size:checked.fileSize,sha256:checked.sha256,uploaded_by:user.id
 }).select(metadataFields).single();
 if(saved.error||!saved.data){
  // Only remove the orphaned new object, never an existing original.
  await s.storage.from(vatAttachmentBucket).remove([path]);
  if(saved.error?.code==="23505"){
   // A concurrent identical upload may have won the unique constraint.
   const locked=await s.from("vat_purchase_document_files")
    .select(metadataFields).eq("purchase_document_id",documentId).maybeSingle();
   if(!locked.error&&sameOriginal(locked.data,checked))
    return NextResponse.json({ok:true,alreadyUploaded:true,attachment:confirmedAttachment(locked.data)},
     {status:200,headers:{"Cache-Control":"private, no-store"}});
   return fail("Et annet originalbilag er allerede knyttet til registreringen.",409);
  }
  return fail("Dokumenttilknytningen kunne ikke lagres. Prøv igjen.",503);
 }
 return NextResponse.json({ok:true,attachment:confirmedAttachment(saved.data)},
  {status:201,headers:{"Cache-Control":"private, no-store"}});
}
