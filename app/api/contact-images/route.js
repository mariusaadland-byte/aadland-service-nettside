import { NextResponse } from "next/server";
import { db } from "../../../lib/supabase";

const allowed=new Set(["image/jpeg","image/png","image/webp"]);
const maxFiles=8;
const maxSize=10*1024*1024;

export async function POST(request){
 try{
  const supabase=db();
  if(!supabase) return NextResponse.json({error:"Lagring er ikke konfigurert."},{status:500});
  const data=await request.formData();
  const files=data.getAll("images").filter(f=>f&&typeof f.arrayBuffer==="function");
  if(!files.length) return NextResponse.json({urls:[]});
  if(files.length>maxFiles) return NextResponse.json({error:"Du kan laste opp maks 8 bilder."},{status:400});
  const urls=[];
  for(const file of files){
   if(!allowed.has(file.type)) return NextResponse.json({error:"Bruk JPG, PNG eller WebP."},{status:400});
   if(file.size>maxSize) return NextResponse.json({error:"Hvert bilde kan være maks 10 MB."},{status:400});
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path="contact/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"."+ext;
   const bytes=new Uint8Array(await file.arrayBuffer());
   const {error}=await supabase.storage.from("product-images").upload(path,bytes,{contentType:file.type,upsert:false});
   if(error) throw error;
   const {data:publicData}=supabase.storage.from("product-images").getPublicUrl(path);
   urls.push(publicData.publicUrl);
  }
  return NextResponse.json({urls});
 }catch(error){
  console.error("contact image upload",error);
  return NextResponse.json({error:"Kunne ikke laste opp bildene."},{status:500});
 }
}
