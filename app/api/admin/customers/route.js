import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

export async function GET(){
 const currentUser=await getAdminUser();
 if(!currentUser)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 if(!(await hasPermission("canViewOrders"))){
  return NextResponse.json({error:"Du har ikke tilgang til kunderegisteret."},{status:403});
 }

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const [profilesResult,quotesResult]=await Promise.all([
  s.from("customer_profiles")
   .select("id,email,name,phone,address,created_at,updated_at")
   .order("created_at",{ascending:false})
   .limit(1000),
  s.from("quotes")
   .select("id,quote_number,title,status,total_inc_vat_ore,customer,created_at,sent_at,accepted_at,declined_at")
   .order("created_at",{ascending:false})
   .limit(1000)
 ]);

 if(profilesResult.error){
  if(String(profilesResult.error.code||"")==="42P01")return NextResponse.json({customers:[],quotes:[],setupRequired:true});
  console.error("ADMIN CUSTOMERS GET",profilesResult.error);
  return NextResponse.json({error:"Kundekontoene kunne ikke hentes."},{status:500});
 }

 let quotes=[];
 if(quotesResult.error){
  if(!["42P01","42703"].includes(String(quotesResult.error.code||""))){
   console.error("ADMIN CUSTOMER QUOTES GET",quotesResult.error);
  }
 }else{
  quotes=(quotesResult.data||[]).map(row=>({
   id:row.id,
   quoteNumber:row.quote_number||"",
   title:row.title||"Tilbud",
   status:row.status||"",
   totalOre:Number(row.total_inc_vat_ore)||0,
   customer:row.customer||{},
   createdAt:row.created_at||null,
   sentAt:row.sent_at||null,
   acceptedAt:row.accepted_at||null,
   declinedAt:row.declined_at||null
  }));
 }

 return NextResponse.json({
  customers:(profilesResult.data||[]).map(row=>({
   id:row.id,
   email:row.email||"",
   name:row.name||"",
   phone:row.phone||"",
   address:row.address||"",
   createdAt:row.created_at||null,
   updatedAt:row.updated_at||null,
   hasAccount:true
  })),
  quotes
 });
}
