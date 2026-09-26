import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
async function allowed(){return (await getAdminUser())&&(await hasPermission("canManageProducts"))}

function projectApiError(error){
 const message=String(error?.message||"");
 const missingStoryColumn=error?.code==="42703"||error?.code==="PGRST204"||message.includes("content_blocks");
 if(missingStoryColumn){
  return NextResponse.json({
   error:"Prosjektfortelling krever en databaseoppdatering før den kan lagres.",
   setupRequired:true,
   migration:"supabase/project_content_blocks.sql"
  },{status:503});
 }
 console.error("PROJECT API",error);\n return NextResponse.json({error:"Oppdraget kunne ikke lagres."},{status:500});
}
const slugify=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
const map=p=>({id:p.id,title:p.title,slug:p.slug,category:p.category||"",description:p.description||"",imageUrls:Array.isArray(p.image_urls)?p.image_urls:[],contentBlocks:Array.isArray(p.content_blocks)?p.content_blocks:[],featured:p.featured!==false,active:p.active!==false,sortOrder:p.sort_order||0});

function cleanBlocks(input,imageUrls){
 const allowedImages=new Set(imageUrls);
 return (Array.isArray(input)?input:[]).slice(0,80).map((block,index)=>{
  const type=block?.type==="text"?"text":"image";
  const id=String(block?.id||("block-"+index)).slice(0,120);
  if(type==="text"){
   return {
    id,
    type:"text",
    eyebrow:String(block?.eyebrow||"").trim().slice(0,80),
    title:String(block?.title||"").trim().slice(0,180),
    body:String(block?.body||"").trim().slice(0,5000)
   };
  }
  const url=String(block?.url||"").trim().slice(0,2000);
  if(!url||!allowedImages.has(url))return null;
  return {
   id,
   type:"image",
   url,
   caption:String(block?.caption||"").trim().slice(0,300),
   alt:String(block?.alt||"").trim().slice(0,300)
  };
 }).filter(Boolean);
}

function values(b){
 const imageUrls=Array.isArray(b.imageUrls)?b.imageUrls.map(x=>String(x||"").trim().slice(0,2000)).filter(Boolean).slice(0,30):[];
 return {
  title:String(b.title||"").trim().slice(0,180),
  category:String(b.category||"").trim().slice(0,120),
  description:String(b.description||"").trim().slice(0,8000),
  image_urls:imageUrls,
  content_blocks:cleanBlocks(b.contentBlocks,imageUrls),
  featured:b.featured!==false,
  active:b.active!==false,
  sort_order:Math.max(-100000,Math.min(100000,Math.round(Number(b.sortOrder)||0))),
  updated_at:new Date().toISOString()
 };
}
export async function GET(){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const probe=await s.from("projects").select("content_blocks").limit(1);
 const probeMessage=String(probe.error?.message||"");
 const storySetupRequired=Boolean(
  probe.error&&(
   probe.error.code==="42703"||
   probe.error.code==="PGRST204"||
   probeMessage.includes("content_blocks")
  )
 );

 const {data,error}=await s.from("projects").select("*").order("sort_order").order("created_at",{ascending:false});
 if(error){
  if(error.code==="42P01")return NextResponse.json({projects:[],setupRequired:true,storySetupRequired:true});
  console.error("PROJECTS GET",error);\n  return NextResponse.json({error:"Prosjektene kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({projects:(data||[]).map(map),storySetupRequired});
}
export async function POST(req){if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});const b=await req.json();if(!String(b.title||"").trim())return NextResponse.json({error:"Oppdraget må ha en tittel."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const v=values(b);v.slug=slugify(v.title)+"-"+Date.now().toString().slice(-5);const {data,error}=await s.from("projects").insert(v).select("*").single();if(error)return projectApiError(error);return NextResponse.json({project:map(data)})}
export async function PATCH(req){if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});const b=await req.json();if(!b.id)return NextResponse.json({error:"Oppdrag mangler."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {data,error}=await s.from("projects").update(values(b)).eq("id",b.id).select("*").single();if(error)return projectApiError(error);return NextResponse.json({project:map(data)})}
export async function DELETE(req){if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});const {id}=await req.json();if(!id)return NextResponse.json({error:"Oppdrag mangler."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {error}=await s.from("projects").delete().eq("id",id);if(error){console.error("PROJECT DELETE",error);return NextResponse.json({error:"Prosjektet kunne ikke slettes."},{status:500})}return NextResponse.json({ok:true})}
