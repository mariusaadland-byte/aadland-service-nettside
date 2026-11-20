import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {vatAttachmentBucket,MAX_VAT_FILE_SIZE,inspectVatAttachment,
 vatAttachmentDownloadName} from "../../../../../lib/vatPurchaseAttachments";
import {externalInvoiceInput,externalInvoicePaidInput}
 from "../../../../../lib/externalInvoiceRegister";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const uuid=x=>typeof x==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const todayOslo=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());

export async function GET(req){
 const owner=await getAdminUser();
 if(owner?.role!=="owner")return json({error:"Kun eier kan se eksterne fakturaer."},403);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const q=new URL(req.url).searchParams;
 if(q.get("download")==="1"){
  const id=q.get("id");
  if(!uuid(id))return json({error:"Ugyldig faktura."},400);
  const {data,error}=await s.from("external_customer_invoices")
   .select("storage_path,original_filename,mime_type,file_size,sha256")
   .eq("id",id).maybeSingle();
  if(error||!data)return json({error:"Fakturaen finnes ikke."},404);
  const object=await s.storage.from(vatAttachmentBucket).download(data.storage_path);
  if(object.error||!object.data)return json({error:"Originaldokumentet kunne ikke leses."},503);
  const bytes=Buffer.from(await object.data.arrayBuffer());
  if(bytes.length!==Number(data.file_size)||bytes.length>MAX_VAT_FILE_SIZE||
   crypto.createHash("sha256").update(bytes).digest("hex")!==data.sha256)
   return json({error:"Dokumentet bestod ikke filkontroll."},409);
  return new NextResponse(bytes,{headers:{
   ...headers,"Content-Type":data.mime_type,
   "Content-Disposition":'attachment; filename="'+vatAttachmentDownloadName(data.original_filename)+'"',
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"default-src 'none'; sandbox"
  }});
 }
 const offsetRaw=q.get("offset")||"0";
 if(!/^\d{1,5}$/.test(offsetRaw)||Number(offsetRaw)>10000)
  return json({error:"Ugyldig sidevalg."},400);
 const offset=Number(offsetRaw),size=100;
 const {data,error}=await s.from("external_customer_invoices")
  .select("id,source_system,invoice_number,customer_name,issued_on,due_on,amount_ore,note,status,paid_on,payment_note,paid_at,original_filename,created_at")
  .order("created_at",{ascending:false}).order("id",{ascending:false})
  .range(offset,offset+size);
 if(error||!Array.isArray(data))return json({error:"Fakturaoversikten kunne ikke hentes."},503);
 return json({ok:true,invoices:data.slice(0,size),hasMore:data.length>size,nextOffset:offset+size});
}

export async function POST(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan importere eksterne fakturaer."},403);
 if(process.env.VERCEL_ENV==="preview")
  return json({error:"Fakturaer kan bare registreres på produksjonssiden."},403);
 if(Number(req.headers.get("content-length")||0)>MAX_VAT_FILE_SIZE+131072)
  return json({error:"Filen er for stor (maks 4 MB)."},413);
 let form;
 try{form=await req.formData()}catch{return json({error:"Kunne ikke lese fakturaen."},400);}
 let fields;
 try{fields=externalInvoiceInput(Object.fromEntries([
  "sourceSystem","invoiceNumber","customerName","issuedOn","dueOn","amount",
  "note","notDuplicateConfirmed"
 ].map(k=>[k,form.get(k)])));}
 catch(e){return json({error:e.message},400);}
 const file=form.get("file");
 if(!file||typeof file.arrayBuffer!=="function"||file.size>MAX_VAT_FILE_SIZE||
  file.size<12)return json({error:"Velg PDF eller bilde på maks 4 MB."},400);
 let bytes,check;
 try{
  bytes=Buffer.from(await file.arrayBuffer());
  check=inspectVatAttachment(bytes,file.type,file.name);
 }catch(e){return json({error:e.message},400);}
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 // Native invoices must remain in the native archive; this is only for
 // documents originally issued outside Aadland Service.
 const native=await s.from("invoice_drafts").select("id")
  .eq("invoice_number",fields.invoice_number).neq("status","draft").limit(1);
 if(native.error)return json({error:"Kunne ikke kontrollere tidligere fakturaer."},503);
 if(native.data?.length)return json({
  error:"Fakturanummeret finnes allerede blant utstedte Aadland-fakturaer. Ikke importer den på nytt."
 },409);
 const id=crypto.randomUUID();
 const path="external-customer-invoices/"+id+"/"+crypto.randomUUID()+"."+check.ext;
 const upload=await s.storage.from(vatAttachmentBucket).upload(path,bytes,{
  contentType:check.mimeType,cacheControl:"0",upsert:false
 });
 if(upload.error)return json({error:"Originalfakturaen kunne ikke lagres privat."},503);
 const saved=await s.from("external_customer_invoices").insert({
  id,...fields,storage_path:path,original_filename:check.filename,
  mime_type:check.mimeType,file_size:check.fileSize,sha256:check.sha256,
  created_by:user.id
 }).select("id").single();
 if(saved.error||!saved.data){
  await s.storage.from(vatAttachmentBucket).remove([path]);
  return json({error:saved.error?.code==="23505"?
   "Denne fakturaen eller originalfilen finnes allerede i registeret. Hent oversikten før du prøver igjen.":
   "Fakturaen kunne ikke registreres. Ingen ny faktura er utstedt."},
   saved.error?.code==="23505"?409:503);
 }
 return json({ok:true,id:saved.data.id},201);
}

export async function PATCH(req){
 const csrf=sameOriginGuard(req);if(csrf)return csrf;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan endre betalingsstatus."},403);
 if(process.env.VERCEL_ENV==="preview")
  return json({error:"Betalingsstatus kan bare endres i produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.id))return json({error:"Velg en gyldig faktura."},400);
 let payment;
 try{payment=externalInvoicePaidInput(body,todayOslo());}
 catch(e){return json({error:e.message},400);}
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const changed=await s.from("external_customer_invoices").update({
  status:"paid",...payment,paid_at:new Date().toISOString(),
  paid_by:user.id,updated_at:new Date().toISOString()
 }).eq("id",body.id).eq("status","unpaid")
  .select("id,status,paid_on,paid_at").maybeSingle();
 if(changed.error)return json({error:"Betalingen kunne ikke registreres."},503);
 if(!changed.data)return json({
  error:"Fakturaen er allerede markert betalt eller finnes ikke. Oppdater oversikten før nytt forsøk."
 },409);
 return json({ok:true,invoice:changed.data,
  note:"Betaling er registrert i Aadland Service. Ingen betaling eller bilag er opprettet i Tripletex."});
}
