import {rateLimitRequest} from "../../../lib/rateLimit";
import {sameOriginGuard} from "../../../lib/requestGuard";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "../../../lib/supabase";
import {createContactImageReceipt} from "../../../lib/contactImageReceipts";

const allowed=new Set(["image/jpeg","image/png","image/webp"]);
const maxFiles=1;
const maxSize=4*1024*1024;
const maxTotal=4*1024*1024;
function matchesSignature(type,bytes){
 if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(type==="image/png")return bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>bytes[i]===v);
 if(type==="image/webp")return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 return false;
}

export async function POST(request){
 const originError=sameOriginGuard(request); if(originError)return originError;
 const rateError=await rateLimitRequest(request,{scope:"contact-images",max:24,windowSeconds:900,message:"For mange bildeopplastinger på kort tid. Prøv igjen senere."}); if(rateError)return rateError;
 try{
  const supabase=db();
  if(!supabase) return NextResponse.json({error:"Lagring er ikke konfigurert."},{status:503});
  const data=await request.formData();
  const files=data.getAll("images").filter(f=>f&&typeof f.arrayBuffer==="function");
  if(!files.length) return NextResponse.json({urls:[]});
  if(files.length>maxFiles) return NextResponse.json({error:"Last opp ett bilde om gangen."},{status:400});
  if(files.reduce((sum,file)=>sum+(Number(file.size)||0),0)>maxTotal)return NextResponse.json({error:"Bildet kan være maks 4 MB."},{status:413});
  const prepared=[];
  for(const file of files){
   if(!allowed.has(file.type)) return NextResponse.json({error:"Bruk JPG, PNG eller WebP."},{status:400});
   if(file.size>maxSize) return NextResponse.json({error:"Bildet kan være maks 4 MB."},{status:413});
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(!matchesSignature(file.type,bytes)) return NextResponse.json({error:"En fil stemmer ikke med valgt bildeformat."},{status:400});
   prepared.push({file,bytes});
  }
  const urls=[];
  const receipts=[];
  const bucket="contact-images";
  for(const {file,bytes} of prepared){
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path="contact/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"."+ext;
   const {error}=await supabase.storage.from(bucket).upload(path,bytes,{contentType:file.type,upsert:false});
   if(error)throw error;
   // The path is private but NOT proof of ownership. Record a random one-time
   // upload receipt before returning it to the browser. If journal creation
   // fails, remove only the object this request just uploaded.
   const proof=createContactImageReceipt(path);
   const registered=await supabase.from("contact_image_uploads").insert({
    storage_path:path,receipt_hash:proof.receiptHash,state:"pending"
   });
   if(registered.error){
    const {error:cleanupError}=await supabase.storage.from(bucket).remove([path]);
    if(cleanupError)console.error("CONTACT IMAGE ROLLBACK NEEDS REVIEW",{path});
    throw Error("CONTACT_IMAGE_RECEIPT_NOT_STORED");
   }
   urls.push(proof.ref);
   receipts.push({ref:proof.ref,receipt:proof.receipt});
  }
  return NextResponse.json({urls,receipts},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("contact image upload",error);
  return NextResponse.json({error:"Kunne ikke laste opp bildene."},{status:500});
 }
}


export async function DELETE(request){
 const originError=sameOriginGuard(request);if(originError)return originError;
 // A public URL and an object path do NOT prove image ownership. Contact
 // images can only be retained by an atomic, receipt-validated order insert,
 // or removed by the private expiry/cleanup cron. Never delete public inputs.
 return NextResponse.json({
  error:"Direkte sletting er sperret av personvernhensyn. Ubrukte kontaktbilder ryddes automatisk."
 },{status:403,headers:{"Cache-Control":"no-store"}});
}
