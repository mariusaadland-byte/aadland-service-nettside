import {NextResponse} from "next/server";
import {getCustomer} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";

function clean(value,max){
 return String(value??"").trim().replace(/\s+/g," ").slice(0,max);
}

export async function PATCH(req){
 try{
  const customer=await getCustomer();
  if(!customer)return NextResponse.json({error:"Ikke innlogget."},{status:401});

  const body=await req.json().catch(()=>({}));
  const name=clean(body.name,120);
  const phone=clean(body.phone,40);
  const address=clean(body.address,300);

  if(!name)return NextResponse.json({error:"Navn må fylles ut."},{status:400});

  const s=db();
  if(!s)return NextResponse.json({error:"Kundekonto er ikke tilgjengelig akkurat nå."},{status:503});

  const {data,error}=await s.from("customer_profiles")
   .update({name,phone,address,updated_at:new Date().toISOString()})
   .eq("id",customer.id)
   .select("id,email,name,phone,address")
   .single();

  if(error){
   console.error("CUSTOMER PROFILE UPDATE",error);
   return NextResponse.json({error:"Kundeopplysningene kunne ikke lagres."},{status:500});
  }

  return NextResponse.json({ok:true,customer:data});
 }catch(error){
  console.error("CUSTOMER PROFILE UPDATE",error);
  return NextResponse.json({error:"Kundeopplysningene kunne ikke lagres."},{status:500});
 }
}
