import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

async function allowed(){
 return (await getAdminUser())&&(await hasPermission("canManageProducts"));
}
function clean(value,max=1000){
 return String(value||"").trim().slice(0,max);
}
function slugify(value){
 return clean(value,160)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/æ/g,"ae")
  .replace(/ø/g,"o")
  .replace(/å/g,"a")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/(^-|-$)/g,"");
}
function map(row){
 return {
  id:row.id,
  name:row.name,
  slug:row.slug,
  description:row.description||"",
  sortOrder:Number(row.sort_order)||0,
  active:row.active!==false
 };
}

export async function GET(){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("rental_categories").select("*").order("sort_order").order("created_at");
 if(error){
  if(error.code==="42P01")return NextResponse.json({categories:[],setupRequired:true});
  return NextResponse.json({error:"Utleiekategoriene kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({categories:(data||[]).map(map)});
}

export async function POST(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json();
 const name=clean(body.name,160);
 if(!name)return NextResponse.json({error:"Kategorien må ha navn."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const base=slugify(name)||"utleie";
 const slug=base+"-"+Date.now().toString().slice(-6);
 const {data,error}=await s.from("rental_categories").insert({
  name,
  slug,
  description:clean(body.description,2000)||null,
  sort_order:Math.round(Number(body.sortOrder)||0),
  active:body.active!==false
 }).select("*").single();
 if(error){
  if(error.code==="42P01")return NextResponse.json({error:"Databaseoppdatering mangler.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Kategorien kunne ikke opprettes."},{status:500});
 }
 return NextResponse.json({category:map(data)});
}

export async function PATCH(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json();
 if(!body.id)return NextResponse.json({error:"Kategori mangler."},{status:400});
 const name=clean(body.name,160);
 if(!name)return NextResponse.json({error:"Kategorien må ha navn."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("rental_categories").update({
  name,
  description:clean(body.description,2000)||null,
  sort_order:Math.round(Number(body.sortOrder)||0),
  active:body.active!==false,
  updated_at:new Date().toISOString()
 }).eq("id",body.id).select("*").single();
 if(error)return NextResponse.json({error:"Kategorien kunne ikke lagres."},{status:500});
 return NextResponse.json({category:map(data)});
}

export async function DELETE(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const {id}=await req.json();
 if(!id)return NextResponse.json({error:"Kategori mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {count,error:countError}=await s.from("rental_items").select("id",{count:"exact",head:true}).eq("category_id",id);
 if(countError)return NextResponse.json({error:"Kunne ikke kontrollere kategorien."},{status:500});
 if((count||0)>0)return NextResponse.json({error:"Flytt utleieproduktene til en annen kategori før kategorien slettes."},{status:409});
 const {error}=await s.from("rental_categories").delete().eq("id",id);
 if(error)return NextResponse.json({error:"Kategorien kunne ikke slettes."},{status:500});
 return NextResponse.json({ok:true});
}
