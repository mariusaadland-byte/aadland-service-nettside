import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {verifyAdminPasswordResetToken} from "../../../../lib/adminPasswordReset";
import {createSessionVersion,SESSION_VERSION_FIELD} from "../../../../lib/sessionVersion";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 try{
  const body=await req.json().catch(()=>({}));
  const token=String(body.token||"");
  const password=String(body.password||"");

  if(password.length<8||password.length>128){
   return NextResponse.json({error:"Passordet må være mellom 8 og 128 tegn."},{status:400});
  }

  const reset=verifyAdminPasswordResetToken(token);
  if(!reset){
   return NextResponse.json({error:"Lenken er ugyldig eller utløpt. Be om en ny lenke.",code:"invalid_or_expired"},{status:410});
  }

  const s=db();
  if(!s)return NextResponse.json({error:"Passordendring er ikke konfigurert."},{status:503});

  const {data:admin,error:adminError}=await s.from("admin_users")
   .select("id,email,active")
   .eq("id",reset.id)
   .eq("active",true)
   .maybeSingle();

  if(adminError||!admin||String(admin.email||"").trim().toLowerCase()!==reset.email){
   return NextResponse.json({error:"Lenken er ugyldig eller utløpt. Be om en ny lenke.",code:"invalid_or_expired"},{status:410});
  }

  const {data:userResult,error:userError}=await s.auth.admin.getUserById(reset.id);
  const authUser=userResult?.user||null;
  const currentVersion=String(authUser?.updated_at||authUser?.created_at||"");
  if(userError||!authUser||String(authUser.email||"").trim().toLowerCase()!==reset.email||currentVersion!==reset.version){
   return NextResponse.json({error:"Lenken er ugyldig eller allerede brukt. Be om en ny lenke.",code:"invalid_or_expired"},{status:410});
  }

  const nextSessionVersion=createSessionVersion();
  const {error:updateError}=await s.auth.admin.updateUserById(reset.id,{password,app_metadata:{...(authUser.app_metadata||{}),[SESSION_VERSION_FIELD]:nextSessionVersion}});
  if(updateError){
   console.error("ADMIN PASSWORD UPDATE",updateError);
   return NextResponse.json({error:"Kunne ikke lagre nytt passord. Be om en ny lenke."},{status:500});
  }

  return NextResponse.json({ok:true});
 }catch(error){
  console.error("ADMIN PASSWORD UPDATE",error);
  return NextResponse.json({error:"Kunne ikke lagre nytt passord. Be om en ny lenke."},{status:500});
 }
}
