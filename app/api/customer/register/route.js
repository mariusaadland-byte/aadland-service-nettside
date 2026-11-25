import {rateLimitRequest,rateLimitValue} from "../../../../lib/rateLimit";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {sendCustomerVerificationEmail} from "../../../../lib/customerVerificationDelivery";
import {checkNewPassword} from "../../../../lib/passwordSecurity";
import {customerResendApiKey} from "../../../../lib/rentalEmailConfig";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 // A test branch must never create a real auth user or send to a customer.
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({
  error:"Kunderegistrering er deaktivert i testmiljøet."},{status:403});
 const rateError=await rateLimitRequest(req,{"scope":"customer-register","max":5,"windowSeconds":900,"message":"For mange registreringsforsøk. Prøv igjen senere."}); if(rateError)return rateError;
 try{
  const b=await req.json();
  const email=String(b.email||"").trim().toLowerCase();
  const name=String(b.name||"").trim();
  const phone=String(b.phone||"").trim();
  const address=String(b.address||"").trim();
  const password=String(b.password||"");

  if(name.length>120||email.length>254||phone.length>40||address.length>300)return NextResponse.json({error:"Kontaktinformasjonen er for lang."},{status:400});
  if(!name||!email||password.length<8||password.length>128)return NextResponse.json({error:"Fyll inn navn og e-post. Passordet må ha minst 8 tegn."},{status:400});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
  const emailRateError=await rateLimitValue(email,{"scope":"customer-register-email","max":3,"windowSeconds":3600,"message":"For mange registreringsforsøk for denne e-postadressen. Prøv igjen senere."}); if(emailRateError)return emailRateError;

  const passwordCheck=await checkNewPassword(password);
  if(!passwordCheck.ok)return NextResponse.json({error:passwordCheck.error},{status:passwordCheck.status});

  const resendKey=customerResendApiKey(req);
  if(!process.env.SESSION_SECRET)return NextResponse.json({error:"Kundekonto er ikke konfigurert."},{status:503});
  if(!resendKey)return NextResponse.json({error:"Bekreftelsesmail er ikke konfigurert."},{status:503});

  const s=db();
  if(!s)return NextResponse.json({error:"Kundekonto er ikke konfigurert."},{status:503});
  const {data,error}=await s.auth.admin.createUser({
   email,
   password,
   email_confirm:false,
   user_metadata:{customer:true,name:name.slice(0,120)}
  });

  if(error||!data.user){
   return NextResponse.json({error:"Kunne ikke opprette konto. E-postadressen kan allerede være registrert."},{status:400});
  }

  const profile={
   id:data.user.id,
   email,
   name:name.slice(0,120),
   phone:phone.slice(0,40),
   address:address.slice(0,300)
  };

  const {error:profileError}=await s.from("customer_profiles").upsert(profile,{onConflict:"id"});
  if(profileError){
   console.error("CUSTOMER REGISTER PROFILE",profileError);
   // Account is intentionally retained: email resending can repair the profile.
   if(["42P01","42703"].includes(String(profileError.code||""))){
    return NextResponse.json({ok:true,verificationRequired:true,
     message:"Kontoen er opprettet, men kundeprofilen må repareres før bekreftelsesmail kan sendes. Bruk «Send ny bekreftelsesmail» senere.",
     setupRequired:true},{status:202});
   }
   return NextResponse.json({ok:true,verificationRequired:true,
    message:"Kontoen er opprettet, men kundeprofilen kunne ikke lagres. Kontoen er beholdt. Bruk «Send ny bekreftelsesmail» senere."},{status:202});
  }

  const sent=await sendCustomerVerificationEmail({
   req,s,userId:data.user.id,email,name,reason:"registration"
  });
  const accepted=sent.status==="accepted";
  const msg=accepted
   ?"Kontoen er opprettet, og bekreftelsesmailen er mottatt av e-postleverandøren. Sjekk innboksen."
   :sent.status==="uncertain"||sent.status==="unresolved"
    ?"Kontoen er opprettet og beholdt. Utsendingen må kontrolleres; sjekk innboksen før du ber om ny mail."
    :"Kontoen er opprettet og beholdt. Bekreftelsesmail er ikke sendt nå. Bruk «Send ny bekreftelsesmail» på Min side.";
  return NextResponse.json({ok:true,verificationRequired:true,
   deliveryPending:!accepted,message:msg},{status:accepted?200:202});
 }catch(e){
  console.error("CUSTOMER REGISTER",e);
  return NextResponse.json({error:"Kunne ikke opprette konto."},{status:500});
 }
}
