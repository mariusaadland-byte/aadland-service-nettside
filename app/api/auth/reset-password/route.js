import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {createAdminPasswordResetToken} from "../../../../lib/adminPasswordReset";

const genericMessage="Hvis e-postadressen er registrert, sender vi en lenke for å velge nytt passord.";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 try{
  const {email}=await req.json().catch(()=>({}));
  const value=String(email||"").trim().toLowerCase();
  if(!value)return NextResponse.json({error:"Skriv inn e-postadressen din."},{status:400});
  if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});

  const s=db();
  if(!s)return NextResponse.json({error:"Passordgjenoppretting er ikke konfigurert."},{status:503});

  const {data:admin,error:adminError}=await s.from("admin_users")
   .select("id,email,name,active")
   .eq("email",value)
   .eq("active",true)
   .maybeSingle();

  if(adminError){
   console.error("ADMIN PASSWORD RESET PROFILE",adminError);
   return NextResponse.json({ok:true,message:genericMessage});
  }
  if(!admin)return NextResponse.json({ok:true,message:genericMessage});

  const {data:userResult,error:userError}=await s.auth.admin.getUserById(admin.id);
  const authUser=userResult?.user||null;
  if(userError||!authUser||String(authUser.email||"").trim().toLowerCase()!==value){
   if(userError)console.error("ADMIN PASSWORD RESET AUTH",userError);
   return NextResponse.json({ok:true,message:genericMessage});
  }

  const version=String(authUser.updated_at||authUser.created_at||"");
  if(!version)return NextResponse.json({ok:true,message:genericMessage});

  const token=createAdminPasswordResetToken({id:admin.id,email:value,version});
  const requestOrigin=new URL(req.url).origin;
  const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
  const link=base+"/admin/nytt-passord?token="+encodeURIComponent(token);

  const resendKey=process.env.VERCEL_ENV==="preview"
   ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
   :process.env.RESEND_API_KEY;
  if(!resendKey)return NextResponse.json({error:"Passordgjenoppretting er ikke konfigurert."},{status:503});

  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const name=String(admin.name||"").trim()||"administrator";
  const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BACKOFFICE</div></td></tr>
<tr><td style="padding:30px">
<h1 style="font-size:27px;line-height:1.15;margin:0 0 14px;color:#fff">Velg nytt passord</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${name.replace(/[&<>"']/g,"")}. Det er bedt om nytt passord til backoffice-kontoen din.</p>
<a href="${link}" style="display:inline-block;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Velg nytt passord →</a>
<p style="margin:22px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Lenken er gyldig i 60 minutter. Hvis du ikke ba om dette, kan du ignorere e-posten.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · Backoffice</td></tr>
</table></td></tr></table></body></html>`;

  const sent=await resend.emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   to:value,
   replyTo:"post@aadland-service.no",
   subject:"Velg nytt passord – Aadland Service backoffice",
   html
  });
  if(sent?.error)throw new Error(sent.error.message||"E-postfeil");

  return NextResponse.json({ok:true,message:genericMessage});
 }catch(error){
  console.error("ADMIN PASSWORD RESET",error);
  return NextResponse.json({ok:true,message:genericMessage});
 }
}
