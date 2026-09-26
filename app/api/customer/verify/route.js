import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {setCustomerCookie} from "../../../../lib/customer-auth";
import {verifyCustomerVerificationToken} from "../../../../lib/customerVerification";

function confirmationPage(req,token){
 const url=new URL("/min-side/bekreft-epost",req.url);
 if(token)url.searchParams.set("token",token);
 return url;
}

export async function GET(req){
 const token=new URL(req.url).searchParams.get("token")||"";
 return NextResponse.redirect(confirmationPage(req,token));
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 try{
  const body=await req.json().catch(()=>({}));
  const token=String(body.token||"");
  const verified=verifyCustomerVerificationToken(token);
  if(!verified)return NextResponse.json({error:"Bekreftelseslenken er ugyldig eller utløpt.",code:"invalid_or_expired"},{status:410});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||!process.env.SESSION_SECRET)return NextResponse.json({error:"Bekreftelse er ikke konfigurert akkurat nå."},{status:503});

  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await s.auth.admin.getUserById(verified.id);
  const user=userData?.user;
  if(userError||!user||String(user.email||"").trim().toLowerCase()!==verified.email){
   return NextResponse.json({error:"Bekreftelseslenken er ugyldig eller utløpt.",code:"invalid_or_expired"},{status:410});
  }

  if(user.email_confirmed_at){
   return NextResponse.json({error:"E-postadressen er allerede bekreftet. Logg inn på Min side.",code:"already_verified"},{status:410});
  }
  const {error:confirmError}=await s.auth.admin.updateUserById(user.id,{email_confirm:true});
  if(confirmError){
   console.error("CUSTOMER VERIFY CONFIRM",confirmError);
   return NextResponse.json({error:"E-postadressen kunne ikke bekreftes akkurat nå. Prøv igjen."},{status:500});
  }

  let {data:profile,error:profileError}=await s.from("customer_profiles").select("*").eq("id",user.id).maybeSingle();
  if(profileError&&String(profileError.code||"")==="42P01")return NextResponse.json({error:"Kundekonto er ikke aktivert i databasen ennå."},{status:409});
  if(profileError){
   console.error("CUSTOMER VERIFY PROFILE LOOKUP",profileError);
   return NextResponse.json({error:"Kundeprofilen kunne ikke hentes."},{status:500});
  }

  if(!profile){
   const {data:historyOrder}=await s.from("orders")
    .select("customer")
    .contains("customer",{email:verified.email})
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();

   const historyCustomer=historyOrder?.customer||{};
   const metadata=user.user_metadata||{};
   const repair={
    id:user.id,
    email:verified.email,
    name:String(metadata.name||historyCustomer.name||"").trim().slice(0,120),
    phone:String(historyCustomer.phone||"").trim().slice(0,40),
    address:String(historyCustomer.address||"").trim().slice(0,300)
   };
   const {data:created,error:createError}=await s.from("customer_profiles")
    .upsert(repair,{onConflict:"id"})
    .select("*")
    .single();
   if(createError||!created){
    console.error("CUSTOMER VERIFY PROFILE",createError);
    return NextResponse.json({error:"Kundeprofilen kunne ikke opprettes."},{status:500});
   }
   profile=created;
  }

  const [ordersLink,rentalsLink]=await Promise.all([
   s.from("orders").update({customer_user_id:user.id}).is("customer_user_id",null).contains("customer",{email:verified.email}),
   s.from("rental_bookings").update({customer_user_id:user.id}).is("customer_user_id",null).contains("customer",{email:verified.email})
  ]);
  if(ordersLink.error)console.error("CUSTOMER VERIFY ORDER LINK",ordersLink.error);
  if(rentalsLink.error)console.error("CUSTOMER VERIFY RENTAL LINK",rentalsLink.error);

  await setCustomerCookie(user.id);
  return NextResponse.json({ok:true,message:"E-postadressen er bekreftet."});
 }catch(e){
  console.error("CUSTOMER VERIFY",e);
  return NextResponse.json({error:"E-postadressen kunne ikke bekreftes akkurat nå. Prøv igjen."},{status:500});
 }
}
