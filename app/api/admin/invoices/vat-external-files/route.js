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
const owner=async()=>(await getAdminUser())?.role==="owner";
export async function GET(req){
 if(!await owner())return fail("Ingen tilgang til originalfakturaer.",403);
 const url=new URL(req.url),documentId=url.searchParams.get("documentId");
 if(!uuid(documentId))return fail("Ugyldig dokumentnummer.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const {data,error}=await s.from("vat_external_sales_files")
  .select("id,external_document_id,storage_path,original_filename,mime_type,file_size,sha256,uploaded_at")
  .eq("external_document_id",documentId).maybeSingle();
 if(error)return fail("Kunne ikke hente originaldokumentet.",503);
 if(url.searchParams.get("download")!=="1")
  return NextResponse.json({attachment:data?{
   id:data.id,filename:data.original_filename,size:data.file_size,uploadedAt:data.uploaded_at
  }:null},{headers:{"Cache-Control":"private, no-store"}});
 if(!data)return fail("Ingen originalfil er knyttet til fakturaen.",404);
 const received=await s.storage.from(vatAttachmentBucket).download(data.storage_path);
 if(received.error||!received.data)return fail("Originalfilen kunne ikke hentes.",503);
 const buffer=Buffer.from(await received.data.arrayBuffer());
 if(buffer.length!==Number(data.file_size)||buffer.length>MAX_VAT_FILE_SIZE||
    crypto.createHash("sha256").update(buffer).digest("hex")!==data.sha256)
  return fail("Filkontrollen feilet. Kontakt administrator.",409);
 return new NextResponse(buffer,{headers:{
  "Content-Type":data.mime_type,
  "Content-Disposition":'attachment; filename="'+vatAttachmentDownloadName(data.original_filename)+'"',
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "Content-Security-Policy":"default-src 'none'; sandbox"
 }});
}
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();
 if(user?.role!=="owner")return fail("Ingen tilgang til å lagre historiske fakturaer.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Originalfakturaer kan bare lastes opp fra produksjonssiden.",403);
 if(Number(req.headers.get("content-length")||0)>MAX_VAT_FILE_SIZE+65536)
  return fail("Filen er for stor (maks 4 MB).",413);
 let body;
 try{body=await req.formData()}catch{return fail("Kunne ikke lese dokumentet.");}
 const documentId=body.get("documentId"),file=body.get("file");
 if(!uuid(documentId)||!file||typeof file.arrayBuffer!=="function"||file.size>MAX_VAT_FILE_SIZE||file.size<12)
  return fail("Velg registrert faktura og en PDF eller bildefil på maks 4 MB.");
 let bytes,check;
 try{bytes=Buffer.from(await file.arrayBuffer());check=inspectVatAttachment(bytes,file.type,file.name);}
 catch(e){return fail(e.message);}
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const [doc,old]=await Promise.all([
  s.from("vat_external_sales_documents").select("id,voided_at").eq("id",documentId).maybeSingle(),
  s.from("vat_external_sales_files").select("id").eq("external_document_id",documentId).maybeSingle()
 ]);
 if(doc.error||old.error)return fail("Kunne ikke kontrollere dokumentet.",503);
 if(!doc.data||doc.data.voided_at)return fail("Den historiske fakturaen er opphevet eller mangler.",409);
 if(old.data)return fail("Denne fakturaen har allerede en låst originalfil.",409);
 const path="vat-external-sales/"+documentId+"/"+crypto.randomUUID()+"."+check.ext;
 const uploaded=await s.storage.from(vatAttachmentBucket)
  .upload(path,bytes,{contentType:check.mimeType,cacheControl:"0",upsert:false});
 if(uploaded.error)return fail("Originalfakturaen kunne ikke lagres privat.",503);
 const result=await s.from("vat_external_sales_files").insert({
  external_document_id:documentId,storage_path:path,original_filename:check.filename,
  mime_type:check.mimeType,file_size:check.fileSize,sha256:check.sha256,uploaded_by:user.id
 }).select("id").single();
 if(result.error||!result.data){
  await s.storage.from(vatAttachmentBucket).remove([path]);
  return fail(result.error?.code==="23505"?
   "Denne fakturaen har allerede originalfil.":"Dokumentfilen kunne ikke kobles til fakturaen.",
   result.error?.code==="23505"?409:503);
 }
 return NextResponse.json({ok:true,id:result.data.id},{status:201,headers:{"Cache-Control":"private, no-store"}});
}
