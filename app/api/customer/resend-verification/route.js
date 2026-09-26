import {rateLimitRequest} from "../../../../lib/rateLimit";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createCustomerVerificationToken} from "../../../../lib/customerVerification";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

const genericMessage="Hvis e-postadressen tilhører en kundekonto som ikke er bekreftet, sender vi en ny bekreftelsesmail.";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const rateError=await rateLimitRequest(req,{"scope":"customer-resend-verification","max":5,"windowSeconds":3600,"message":"For mange forespørsler om bekreftelsesmail. Prøv igjen senere."}); if(rateError)return rateError;
 try{
  const {email}=await req.json().catch(()=>({}));
  const value=String(email||"").trim().toLowerCase();
  if(!value)return NextResponse.json({error:"Skriv inn e-postadressen din."},{status:400});
  if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey=process.env.VERCEL_ENV==="preview"
   ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
   :process.env.RESEND_API_KEY;
  if(!url||!key||!process.env.SESSION_SECRET||!resendKey)return NextResponse.json({error:"Bekreftelsesmail er ikke konfigurert akkurat nå."},{status:503});

  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await s.from("customer_profiles")
   .select("id,email,name")
   .eq("email",value)
   .maybeSingle();

  if(profileError){
   console.error("CUSTOMER RESEND PROFILE",profileError);
   return NextResponse.json({message:genericMessage});
  }
  if(!profile)return NextResponse.json({ok:true,message:genericMessage});

  const {data:userData,error:userError}=await s.auth.admin.getUserById(profile.id);
  const user=userData?.user;
  if(userError||!user||String(user.email||"").trim().toLowerCase()!==value||user.email_confirmed_at){
   return NextResponse.json({ok:true,message:genericMessage});
  }

  const token=createCustomerVerificationToken({id:user.id,email:value});
  const requestOrigin=new URL(req.url).origin;
  const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
  const verifyUrl=new URL("/min-side/bekreft-epost",base);
  verifyUrl.searchParams.set("token",token);

  const name=String(profile.name||user.user_metadata?.name||"").trim();
  const html=`<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px"><tr><td align="center">
   <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #ded7cb">
    <tr><td style="padding:28px 30px;background:#11100e;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">MIN SIDE</div></td></tr>
    <tr><td style="padding:30px">
     <div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">NY BEKREFTELSESLENKE</div>
     <h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px">Bekreft e-post${name?", "+esc(name):""}</h1>
     <p style="color:#625d55;line-height:1.65;margin:0 0 22px">Her er en ny lenke for å bekrefte e-postadressen og aktivere kundekontoen din.</p>
     <a href="${esc(verifyUrl.toString())}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Gå til bekreftelse →</a>
     <p style="margin:24px 0 0;color:#8a857c;font-size:11px;line-height:1.55">På siden må du trykke «Bekreft e-post». Lenken er gyldig i 24 timer.</p>
    </td></tr>
    <tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
   </table>
  </td></tr></table></body></html>`;

  try{
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const sent=await resend.emails.send({
    from:"Aadland Service <noreply@aadland-service.no>",
    to:value,
    replyTo:"post@aadland-service.no",
    subject:"Ny bekreftelseslenke – Aadland Service",
    html
   });
   if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
  }catch(mailError){
   console.error("CUSTOMER RESEND EMAIL",mailError);
   return NextResponse.json({error:"Kunne ikke sende ny bekreftelsesmail akkurat nå. Prøv igjen."},{status:500});
  }

  return NextResponse.json({ok:true,message:"Ny bekreftelsesmail er sendt fra Aadland Service."});
 }catch(e){
  console.error("CUSTOMER RESEND",e);
  return NextResponse.json({error:"Kunne ikke sende ny bekreftelsesmail akkurat nå."},{status:500});
 }
}
