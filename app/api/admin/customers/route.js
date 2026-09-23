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

 const {data,error}=await s.from("customer_profiles")
  .select("id,email,name,phone,address,created_at,updated_at")
  .order("created_at",{ascending:false})
  .limit(1000);

 if(error){
  if(String(error.code||"")==="42P01")return NextResponse.json({customers:[],setupRequired:true});
  console.error("ADMIN CUSTOMERS GET",error);
  return NextResponse.json({error:"Kundekontoene kunne ikke hentes."},{status:500});
 }

 return NextResponse.json({
  customers:(data||[]).map(row=>({
   id:row.id,
   email:row.email||"",
   name:row.name||"",
   phone:row.phone||"",
   address:row.address||"",
   createdAt:row.created_at||null,
   updatedAt:row.updated_at||null,
   hasAccount:true
  }))
 });
}
