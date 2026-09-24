import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createCustomerVerificationToken} from "../../../../lib/customerVerification";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
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

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey=process.env.VERCEL_ENV==="preview"
   ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
   :process.env.RESEND_API_KEY;

  if(!url||!key||!process.env.SESSION_SECRET)return NextResponse.json({error:"Kundekonto er ikke konfigurert."},{status:503});
  if(!resendKey)return NextResponse.json({error:"Bekreftelsesmail er ikke konfigurert."},{status:503});

  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
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
  if(profileError&&["42P01","42703"].includes(String(profileError.code||""))){
   try{await s.auth.admin.deleteUser(data.user.id)}catch(cleanupError){console.error("CUSTOMER REGISTER CLEANUP",cleanupError)}
   return NextResponse.json({error:"Kundekonto er ikke aktivert i databasen ennå.",setupRequired:true},{status:409});
  }
  if(profileError)console.error("CUSTOMER REGISTER PROFILE",profileError);

  const token=createCustomerVerificationToken({id:data.user.id,email});
  const requestOrigin=new URL(req.url).origin;
  const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
  const verifyUrl=new URL("/min-side/bekreft-epost",base);
  verifyUrl.searchParams.set("token",token);

  const html=`<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px"><tr><td align="center">
   <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #ded7cb">
    <tr><td style="padding:28px 30px;background:#11100e;color:#fff">
     <div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div>
     <div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">MIN SIDE</div>
    </td></tr>
    <tr><td style="padding:30px">
     <div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">BEKREFT E-POST</div>
     <h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px">Velkommen, ${esc(name)}</h1>
     <p style="color:#625d55;line-height:1.65;margin:0 0 22px">Åpne Aadland Service-siden og bekreft e-postadressen din for å aktivere kundekontoen.</p>
     <a href="${esc(verifyUrl.toString())}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Gå til bekreftelse →</a>
     <p style="margin:24px 0 0;color:#8a857c;font-size:11px;line-height:1.55">På siden må du trykke «Bekreft e-post». Lenken alene aktiverer ikke kontoen. Lenken er gyldig i 24 timer. Hvis du ikke opprettet denne kontoen, kan du se bort fra e-posten.</p>
    </td></tr>
    <tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
   </table>
  </td></tr></table></body></html>`;

  try{
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const sent=await resend.emails.send({
    from:"Aadland Service <noreply@aadland-service.no>",
    to:email,
    replyTo:"post@aadland-service.no",
    subject:"Bekreft e-postadressen din – Aadland Service",
    html
   });
   if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
  }catch(mailError){
   console.error("CUSTOMER VERIFY EMAIL",mailError);
   try{await s.auth.admin.deleteUser(data.user.id)}catch(cleanupError){console.error("CUSTOMER REGISTER MAIL CLEANUP",cleanupError)}
   return NextResponse.json({error:"Kontoen kunne ikke opprettes fordi bekreftelsesmailen ikke kunne sendes. Prøv igjen."},{status:500});
  }

  return NextResponse.json({
   ok:true,
   verificationRequired:true,
   message:"Kontoen er opprettet. Vi har sendt en bekreftelsesmail fra Aadland Service. Åpne mailen og trykk deretter «Bekreft e-post» på siden."
  });
 }catch(e){
  console.error("CUSTOMER REGISTER",e);
  return NextResponse.json({error:"Kunne ikke opprette konto."},{status:500});
 }
}
