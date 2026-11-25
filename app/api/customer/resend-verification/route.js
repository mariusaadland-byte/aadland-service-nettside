import {rateLimitRequest,rateLimitValue} from "../../../../lib/rateLimit";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {customerResendApiKey} from "../../../../lib/rentalEmailConfig";
import {customerVerificationGenericMessage,sendCustomerVerificationEmail} from "../../../../lib/customerVerificationDelivery";

export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(process.env.VERCEL_ENV!=="production")
  return NextResponse.json({error:"Bekreftelsesmail sendes bare fra produksjonsmiljøet."},{status:403});
 const rateError=await rateLimitRequest(req,{"scope":"customer-resend-verification",
  "max":5,"windowSeconds":3600,
  "message":"For mange forespørsler om bekreftelsesmail. Prøv igjen senere."});
 if(rateError)return rateError;
 try{
  const body=await req.json().catch(()=>({}));
  const email=String(body.email||"").trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
  const emailLimit=await rateLimitValue(email,{"scope":"customer-resend-verification-email",
   "max":3,"windowSeconds":3600,
   "message":"For mange forespørsler om bekreftelsesmail for denne e-postadressen. Prøv igjen senere."});
  if(emailLimit)return emailLimit;
  if(!process.env.SESSION_SECRET||!customerResendApiKey(req))
   return NextResponse.json({error:"Bekreftelsesmail er ikke konfigurert akkurat nå."},{status:503});
  const s=db();
  if(!s)return NextResponse.json({error:"Kundekonto er ikke tilgjengelig akkurat nå."},{status:503});

  // First use the public customer profile. If profile creation failed after
  // auth.createUser, a restricted server-only RPC can recover the pending ID.
  let {data:profile,error:profileError}=await s.from("customer_profiles")
   .select("id,email,name,phone,address").eq("email",email).maybeSingle();
  if(profileError){
   console.error("S29 RESEND PROFILE LOOKUP",profileError.code||"unknown");
   return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
  }
  let userId=profile?.id||null;
  if(!userId){
   const {data:found,error:findError}=await s.rpc("find_unconfirmed_customer_by_email",{
    p_email:email
   });
   if(findError){
    console.error("S29 RESEND PENDING LOOKUP",findError.code||"unknown");
    return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
   }
   userId=found||null;
  }
  if(!userId)return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
  const {data:account,error:accountError}=await s.auth.admin.getUserById(userId);
  const user=account?.user;
  if(accountError||!user||String(user.email||"").trim().toLowerCase()!==email||
    user.email_confirmed_at)
   return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
  if(!profile){
   const metadata=user.user_metadata||{};
   const repaired={
    id:user.id,email,
    name:String(metadata.name||"").slice(0,120),
    phone:String(metadata.phone||"").slice(0,40),
    address:String(metadata.address||"").slice(0,300)
   };
   const result=await s.from("customer_profiles")
    .upsert(repaired,{onConflict:"id"}).select("id,name").maybeSingle();
   if(result.error){
    console.error("S29 RESEND PROFILE REPAIR",result.error.code||"unknown");
    return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
   }
   profile=result.data||repaired;
  }
  await sendCustomerVerificationEmail({
   req,s,userId:user.id,email,name:profile.name||user.user_metadata?.name||"",reason:"resend"
  });
  // No account enumeration: do not disclose existence, provider outcome or
  // whether a previous attempt has an unresolved delivery status.
  return NextResponse.json({ok:true,message:customerVerificationGenericMessage});
 }catch(error){
  console.error("S29 CUSTOMER RESEND",error?.message||"unknown");
  return NextResponse.json({error:"Bekreftelsesmail kunne ikke behandles akkurat nå."},{status:503});
 }
}
