import crypto from "crypto";
import { cookies } from "next/headers";
const COOKIE="aadland_admin";
function secret(){ return process.env.SESSION_SECRET || "CHANGE-ME"; }
export function token(){
  return crypto.createHmac("sha256",secret()).update("aadland-service-admin").digest("hex");
}
export async function isAdmin(){
  const c=await cookies();
  const v=c.get(COOKIE)?.value||"";
  const a=Buffer.from(v), b=Buffer.from(token());
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export async function setAdminCookie(){
  const c=await cookies();
  c.set(COOKIE,token(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*14});
}
export async function clearAdminCookie(){ (await cookies()).delete(COOKIE); }
