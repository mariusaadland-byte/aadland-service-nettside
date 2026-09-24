import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {setCustomerCookie} from "../../../../lib/customer-auth";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 try{
  const {email,password}=await req.json();
  const value=String(email||"").trim().toLowerCase();
  const secret=String(password||"");
  if(!value||!secret)return NextResponse.json({error:"Skriv inn e-post og passord."},{status:400});
  if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||secret.length>128)return NextResponse.json({error:"Feil e-post eller passord."},{status:401});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||!process.env.SESSION_SECRET)return NextResponse.json({error:"Kundeinnlogging er ikke konfigurert."},{status:503});

  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await s.auth.signInWithPassword({email:value,password:secret});
  if(error||!data.user)return NextResponse.json({error:"Feil e-post eller passord, eller e-postadressen er ikke bekreftet."},{status:401});
  if(!data.user.email_confirmed_at)return NextResponse.json({error:"Bekreft e-postadressen din før du logger inn."},{status:403});

  let {data:profile,error:profileError}=await s.from("customer_profiles").select("*").eq("id",data.user.id).maybeSingle();
  if(profileError){
   if(String(profileError.code||"")==="42P01")return NextResponse.json({error:"Kundekonto er ikke aktivert i databasen ennå.",setupRequired:true},{status:409});
   console.error("CUSTOMER PROFILE LOOKUP",profileError);
   return NextResponse.json({error:"Kundeprofilen kunne ikke hentes."},{status:500});
  }

  if(!profile){
   let historyCustomer=null;
   const {data:historyOrder}=await s.from("orders")
    .select("customer")
    .contains("customer",{email:value})
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
   historyCustomer=historyOrder?.customer||null;

   const metadata=data.user.user_metadata||{};
   const repair={
    id:data.user.id,
    email:value,
    name:String(metadata.name||historyCustomer?.name||"").trim().slice(0,120),
    phone:String(historyCustomer?.phone||"").trim().slice(0,40),
    address:String(historyCustomer?.address||"").trim().slice(0,300)
   };

   const {data:created,error:createError}=await s.from("customer_profiles")
    .upsert(repair,{onConflict:"id"})
    .select("*")
    .single();

   if(createError||!created){
    console.error("CUSTOMER PROFILE REPAIR",createError);
    return NextResponse.json({error:"Kundeprofilen manglet og kunne ikke opprettes automatisk."},{status:500});
   }
   profile=created;
  }

  const [ordersLink,rentalsLink]=await Promise.all([
   s.from("orders").update({customer_user_id:data.user.id}).is("customer_user_id",null).contains("customer",{email:value}),
   s.from("rental_bookings").update({customer_user_id:data.user.id}).is("customer_user_id",null).contains("customer",{email:value})
  ]);
  if(ordersLink.error)console.error("CUSTOMER ORDER HISTORY LINK",ordersLink.error);
  if(rentalsLink.error)console.error("CUSTOMER RENTAL HISTORY LINK",rentalsLink.error);

  await setCustomerCookie(data.user.id);
  return NextResponse.json({ok:true,profileRepaired:Boolean(profile)});
 }catch(e){
  console.error("CUSTOMER LOGIN",e);
  return NextResponse.json({error:"Kunne ikke logge inn."},{status:500});
 }
}
