import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {systimaSetupStatus} from "../../../../../lib/systimaIntegrationStatus";
import {secureSystimaSeal} from "../../../../../lib/systimaTokenVault";
export const runtime="nodejs";
export const maxDuration=30;
const cookieName="aadland_systima_oauth_state";
const resultRedirect=(status)=>new URL("/admin/faktura/systima?status="+status,process.env.NEXT_PUBLIC_SITE_URL);
export async function GET(req){
 const redirect=code=>{
  const response=NextResponse.redirect(resultRedirect(code),303);
  response.cookies.set(cookieName,"",{httpOnly:true,secure:true,sameSite:"lax",
   path:"/api/admin/systima",maxAge:0});
  response.headers.set("Cache-Control","private, no-store");
  response.headers.set("Referrer-Policy","no-referrer");
  return response;
 };
 const user=await getAdminUser();
 if(user?.role!=="owner")return redirect("denied");
 if(process.env.VERCEL_ENV!=="production")return redirect("disabled");
 const setup=systimaSetupStatus();
 if(!setup.connectionAvailable)return redirect("not-configured");
 const url=new URL(req.url),state=url.searchParams.get("state")||"";
 const stored=req.cookies.get(cookieName)?.value||"";
 const a=Buffer.from(state+"."+user.id),b=Buffer.from(stored);
 if(!/^[A-Za-z0-9_-]{43}$/.test(state)||a.length!==b.length||
   !crypto.timingSafeEqual(a,b))return redirect("invalid-state");
 const code=url.searchParams.get("authorizationCode")||url.searchParams.get("authCode");
 const clientFromRedirect=url.searchParams.get("oauthClientId");
 if(!code||code.length>2048||clientFromRedirect&&clientFromRedirect!==process.env.SYSTIMA_CLIENT_ID)
  return redirect("invalid-callback");
 const s=db();if(!s)return redirect("storage-error");
 try{
  // Endpoint is supplied by Systima during partner onboarding, never guessed
  // from user input or derived from a callback/query parameter.
  const endpoint=new URL(process.env.SYSTIMA_TOKEN_URL);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  let response;
  try{
   response=await fetch(endpoint.toString(),{
    method:"POST",redirect:"error",cache:"no-store",signal:controller.signal,
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({
     code,clientId:process.env.SYSTIMA_CLIENT_ID,
     clientSecret:process.env.SYSTIMA_CLIENT_SECRET,
     redirectUri:process.env.SYSTIMA_REDIRECT_URI,
     grantType:"authorization_code"
    })
   });
  }finally{clearTimeout(timeout);}
  if(!response.ok)return redirect("authorization-failed");
  const tokens=await response.json();
  if(!tokens||typeof tokens.accessToken!=="string"||
   typeof tokens.refreshToken!=="string"||
   !tokens.accessToken||!tokens.refreshToken||
   tokens.accessToken.length>16000||tokens.refreshToken.length>16000)
   return redirect("authorization-failed");
  const credentials=secureSystimaSeal({
   accessToken:tokens.accessToken,refreshToken:tokens.refreshToken,
   expiresAt:String(tokens.expiresAt||"").slice(0,128),
   refreshTokenExpiresAt:String(tokens.refreshTokenExpiresAt||"").slice(0,128)
  },process.env.SYSTIMA_TOKEN_ENCRYPTION_KEY);
  const now=new Date().toISOString();
  const saved=await s.from("systima_oauth_connections").upsert({
   integration_key:"systima",encrypted_credentials:credentials,
   authorized_by:user.id,authorized_at:now,updated_at:now,
   connection_state:"token_obtained_no_read_endpoint"
  },{onConflict:"integration_key"}).select("integration_key").single();
  if(saved.error)return redirect("storage-error");
  return redirect("authorized");
 }catch{return redirect("authorization-failed");}
}
