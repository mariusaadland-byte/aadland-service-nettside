import {NextResponse} from "next/server";
import crypto from "crypto";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {db} from "../../../../lib/supabase";
import {CONDITION_BUCKET,CONDITION_MAX_BYTES,conditionId,conditionPhase,conditionCanUpload,conditionImageValid,conditionObjectName,conditionStoredName} from "../../../../lib/rentalConditionPhotos.mjs";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
async function authorized(permission){
 const user=await getAdminUser();
 return user&&(user.role==="owner"||await hasPermission(permission))?user:null;
}
async function context(id){
 if(!conditionId(id))return {response:json({error:"Ugyldig booking."},400)};
 const s=db();
 if(!s)return {response:json({error:"Databasen er ikke tilgjengelig."},503)};
 const {data:booking,error}=await s.from("rental_bookings").select("id,status,archived_at").eq("id",id).maybeSingle();
 if(error)return {response:json({error:"Bookingen kunne ikke kontrolleres."},503)};
 if(!booking)return {response:json({error:"Bookingen ble ikke funnet."},404)};
 const bucket=await s.storage.getBucket(CONDITION_BUCKET);
 if(bucket.error||bucket.data?.public!==false)return {response:json({error:"Privat bildelagring er ikke verifisert. Kontakt administrator.",setupRequired:true},503)};
 return {s,booking,storage:s.storage.from(CONDITION_BUCKET)};
}
export async function GET(req){
 if(!await authorized("canViewOrders"))return json({error:"Ingen tilgang."},403);
 const limited=await rateLimitRequest(req,{scope:"rental-condition-read",max:60,windowSeconds:60,message:"For mange bildeforespørsler."});
 if(limited)return limited;
 const c=await context(new URL(req.url).searchParams.get("bookingId"));
 if(c.response)return c.response;
 const groups={before:[],after:[]};
 for(const phase of ["before","after"]){
  const prefix=c.booking.id+"/"+phase;
  const {data,error}=await c.storage.list(prefix,{limit:100,sortBy:{column:"created_at",order:"desc"}});
  if(error)return json({error:"Bildene kunne ikke hentes."},503);
  const files=(data||[]).filter(x=>conditionStoredName(x.name));
  const signed=await Promise.all(files.map(async x=>{
   const result=await c.storage.createSignedUrl(prefix+"/"+x.name,300);
   return {id:x.name,createdAt:x.created_at,url:result.error?null:result.data?.signedUrl||null};
  }));
  groups[phase]=signed;
 }
 return json({groups,limit:100});
}
export async function POST(req){
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"Utleieendringer er sperret utenfor produksjon."},{status:403,headers:{"Cache-Control":"no-store"}});

 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await authorized("canUpdateOrders");
 if(!user)return json({error:"Ingen tilgang."},403);
 const limited=await rateLimitRequest(req,{scope:"rental-condition-upload",max:30,windowSeconds:900,message:"For mange bildeopplastinger."});
 if(limited)return limited;
 try{
  const form=await req.formData(),id=String(form.get("bookingId")||""),phase=String(form.get("phase")||""),file=form.get("file");
  if(!conditionPhase(phase)||!file||typeof file.arrayBuffer!=="function")return json({error:"Velg bilde og kontrolltype."},400);
  if(file.size>CONDITION_MAX_BYTES)return json({error:"Maks 4 MB per bilde."},413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!conditionImageValid(file.type,bytes))return json({error:"Bruk gyldig JPG, PNG eller WebP."},400);
  const c=await context(id);if(c.response)return c.response;
  if(!conditionCanUpload(c.booking,phase))return json({error:"Bookingstatus tillater ikke denne bilderegistreringen."},409);
  const name=conditionObjectName(user.id,crypto.createHash("sha256").update(bytes).digest("hex"),file.type);
  if(!name)return json({error:"Bildereferansen kunne ikke opprettes."},400);
  const prefix=c.booking.id+"/"+phase;
  const {data:existing,error:listError}=await c.storage.list(prefix,{limit:100});
  if(listError)return json({error:"Eksisterende bilder kunne ikke kontrolleres."},503);
  if((existing||[]).some(x=>x.name===name))return json({ok:true,reused:true});
  if((existing||[]).length>=100)return json({error:"Maks 100 bilder per kontrolltype. Kontakt administrator."},409);
  const {error}=await c.storage.upload(prefix+"/"+name,bytes,{contentType:file.type,upsert:false});
  if(error)return json({error:"Bildet kunne ikke lagres. Oppdater oversikten før nytt forsøk."},503);
  return json({ok:true});
 }catch{return json({error:"Bildet kunne ikke behandles."},400);}
}
