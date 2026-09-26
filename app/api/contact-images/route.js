import {sameOriginGuard} from "../../../lib/requestGuard";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "../../../lib/supabase";

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

function privateContactPath(ref){
 const prefix="private-image:contact-images:";
 const value=String(ref||"");
 if(!value.startsWith(prefix))return null;
 const path=value.slice(prefix.length);
 if(!/^contact\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(path))return null;
 return path;
}

export async function POST(request){
 const originError=sameOriginGuard(request); if(originError)return originError;
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
  const uploaded=[];
  const bucket="contact-images";
  for(const {file,bytes} of prepared){
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path="contact/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"."+ext;
   const {error}=await supabase.storage.from(bucket).upload(path,bytes,{contentType:file.type,upsert:false});
   if(error) {
    if(uploaded.length){const {error:cleanupError}=await supabase.storage.from(bucket).remove(uploaded);if(cleanupError)console.error("CONTACT IMAGE CLEANUP ERROR",cleanupError);}
    throw error;
   }
   uploaded.push(path);
   urls.push(`private-image:${bucket}:${path}`);
  }
  return NextResponse.json({urls});
 }catch(error){
  console.error("contact image upload",error);
  return NextResponse.json({error:"Kunne ikke laste opp bildene."},{status:500});
 }
}


export async function DELETE(request){
 const originError=sameOriginGuard(request); if(originError)return originError;
 try{
  const supabase=db();
  if(!supabase)return NextResponse.json({error:"Lagring er ikke konfigurert."},{status:503});
  const body=await request.json().catch(()=>({}));
  const refs=Array.isArray(body.refs)?body.refs.slice(0,8):[];
  const paths=[...new Set(refs.map(privateContactPath).filter(Boolean))];
  if(!paths.length)return NextResponse.json({ok:true,removed:0});
  const {error}=await supabase.storage.from("contact-images").remove(paths);
  if(error){
   console.error("CONTACT IMAGE DELETE ERROR",error);
   return NextResponse.json({error:"Bildene kunne ikke ryddes bort."},{status:500});
  }
  return NextResponse.json({ok:true,removed:paths.length});
 }catch(error){
  console.error("CONTACT IMAGE DELETE ERROR",error);
  return NextResponse.json({error:"Bildene kunne ikke ryddes bort."},{status:500});
 }
}
