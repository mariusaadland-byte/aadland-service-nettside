import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {verifyCustomerPasswordResetToken} from "../../../../lib/customerPasswordReset";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 try{
  const {token,password}=await req.json().catch(()=>({}));
  const nextPassword=String(password||"");
  if(!token||nextPassword.length<8||nextPassword.length>128){
   return NextResponse.json({error:"Ugyldig lenke eller passord. Passordet må være mellom 8 og 128 tegn."},{status:400});
  }

  const verified=verifyCustomerPasswordResetToken(token);
  if(!verified)return NextResponse.json({error:"Lenken er ugyldig eller utløpt.",code:"invalid_or_expired"},{status:410});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Passordendring er ikke konfigurert."},{status:503});

  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await s.auth.admin.getUserById(verified.id);
  const user=userData?.user;
  const currentVersion=String(user?.updated_at||user?.created_at||"");
  if(userError||!user||String(user.email||"").trim().toLowerCase()!==verified.email||currentVersion!==verified.version){
   return NextResponse.json({error:"Lenken er ugyldig, utløpt eller allerede brukt.",code:"invalid_or_expired"},{status:410});
  }

  const {error:updateError}=await s.auth.admin.updateUserById(user.id,{password:nextPassword});
  if(updateError){
   console.error("CUSTOMER UPDATE PASSWORD",updateError);
   return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
  }

  return NextResponse.json({ok:true});
 }catch(e){
  console.error("CUSTOMER UPDATE PASSWORD",e);
  return NextResponse.json({error:"Kunne ikke lagre nytt passord."},{status:500});
 }
}
