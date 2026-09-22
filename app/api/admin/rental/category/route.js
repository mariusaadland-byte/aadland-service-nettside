import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

async function allowed(){
 return (await getAdminUser())&&(await hasPermission("canManageProducts"));
}

export async function PATCH(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json();
 const itemId=String(body.itemId||"").trim();
 const categoryId=String(body.categoryId||"").trim()||null;
 if(!itemId)return NextResponse.json({error:"Utstyr mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 if(categoryId){
  const {data:category,error:categoryError}=await s.from("rental_categories").select("id").eq("id",categoryId).eq("active",true).maybeSingle();
  if(categoryError)return NextResponse.json({error:"Kategorien kunne ikke kontrolleres."},{status:500});
  if(!category)return NextResponse.json({error:"Kategorien ble ikke funnet."},{status:404});
 }

 const {data,error}=await s.from("rental_items").update({
  category_id:categoryId,
  updated_at:new Date().toISOString()
 }).eq("id",itemId).select("id,category_id").single();

 if(error){
  if(error.code==="42703"||error.code==="42P01")return NextResponse.json({error:"Databaseoppdatering mangler for utleiekategorier.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Kategorien kunne ikke lagres på produktet."},{status:500});
 }

 return NextResponse.json({ok:true,item:{id:data.id,categoryId:data.category_id||null}});
}
