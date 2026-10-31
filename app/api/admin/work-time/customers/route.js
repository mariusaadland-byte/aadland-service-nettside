import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

// Only administrators with work-clock access can search the existing CRM.
// No customers are created, and private contact records are not public.
export async function GET(){
 const user=await getAdminUser();
 if(!user||(user.role!=="owner"&&!user.canUpdateOrders))
  return NextResponse.json({error:"Ingen tilgang til kunderegisteret."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const sources=[
  {table:"admin_customer_contacts",kind:"contact"},
  {table:"customer_profiles",kind:"profile"}
 ];
 let results;
 try{results=await Promise.all(sources.map(async src=>{
  const all=[];
  for(let offset=0;offset<5000;offset+=500){
   const {data,error}=await s.from(src.table).select("id,name,phone")
    .order("id",{ascending:true}).range(offset,offset+499);
   if(error||!Array.isArray(data))throw Error("Kunderegisteret kunne ikke leses.");
   all.push(...data);
   if(data.length<500)return all.map(row=>({
    customerRef:src.kind+":"+row.id,
    name:String(row.name||"").trim(),
    phone:String(row.phone||"").trim(),
    kind:src.kind
   })).filter(row=>row.name);
  }
  throw Error("Kunderegisteret er for stort til å vise fullstendig.");
 }));}
 catch(e){return NextResponse.json({error:e.message||"Kunderegisteret kunne ikke leses."},{status:503});}
 return NextResponse.json({customers:results.flat().sort((a,b)=>
  a.name.localeCompare(b.name,"nb-NO")),count:results[0].length+results[1].length},
  {headers:{"Cache-Control":"private, no-store"}});
}
