import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||user.canViewOrders||user.canUpdateOrders||user.canManageProducts));
}
const fields="id,name,email,phone,address,created_at,updated_at";
const map=r=>({id:r.id,name:r.name,email:r.email||"",phone:r.phone||"",address:r.address||"",createdAt:r.created_at,updatedAt:r.updated_at});
function sanitize(body){
 const name=String(body.name||"").trim().slice(0,180);
 const email=String(body.email||"").trim().toLowerCase().slice(0,240);
 const phone=String(body.phone||"").trim().slice(0,70);
 const address=String(body.address||"").trim().slice(0,500);
 if(!name)return {error:"Skriv inn kundens navn."};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {error:"Ugyldig e-postadresse."};
 return {data:{name,email:email||null,phone:phone||null,address:address||null,updated_at:new Date().toISOString()}};
}
export async function GET(){
 if(!await allowed())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data,error}=await s.from("admin_customer_contacts").select(fields).order("name").limit(1000);
 if(error)return NextResponse.json({error:"Kundelisten kunne ikke hentes."},{status:500});
 return NextResponse.json({contacts:(data||[]).map(map)});
}
export async function POST(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 if(!await allowed())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const input=sanitize(await request.json().catch(()=>({})));if(input.error)return NextResponse.json({error:input.error},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 if(input.data.email){
  const {data:existing,error:lookupError}=await s.from("admin_customer_contacts").select(fields).eq("email",input.data.email).maybeSingle();
  if(lookupError)return NextResponse.json({error:"Kunne ikke sjekke eksisterende kunde."},{status:500});
  if(existing)return NextResponse.json({contact:map(existing),existing:true});
 }
 const {data,error}=await s.from("admin_customer_contacts").insert(input.data).select(fields).single();
 if(error){console.error("ADMIN CUSTOMER CONTACT CREATE",error);return NextResponse.json({error:"Kunden kunne ikke opprettes. Sjekk om e-posten er i bruk."},{status:500})}
 return NextResponse.json({contact:map(data),existing:false},{status:201});
}
