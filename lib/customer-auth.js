import "server-only";
import crypto from "crypto";
import {cookies} from "next/headers";
import {db} from "./supabase";
import {createSessionVersion,readSessionVersion,sameSessionVersion,SESSION_VERSION_FIELD} from "./sessionVersion";

const COOKIE="aadland_customer";
const SESSION_MAX_AGE=60*60*24*30;

function secret(){
 const v=process.env.SESSION_SECRET;
 if(!v)throw new Error("SESSION_SECRET mangler.");
 return v;
}

function sign(id,version,expiresAt){
 return crypto.createHmac("sha256",secret()).update("customer:"+id+":"+version+":"+expiresAt).digest("hex");
}

function parseSession(value){
 const parts=String(value||"").split(".");
 if(parts.length!==4)return null;
 const [id,version,expiresRaw,signature]=parts;
 const expiresAt=Number(expiresRaw);
 if(!id||!version||!signature||!/^[a-f0-9]{48}$/i.test(version)||!Number.isInteger(expiresAt))return null;
 if(expiresAt<=Math.floor(Date.now()/1000))return null;
 const normalized=version.toLowerCase();
 const expected=sign(id,normalized,expiresAt);
 const a=Buffer.from(signature),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
 return {id,version:normalized,expiresAt};
}

async function ensureSessionVersion(s,id){
 const {data,error}=await s.auth.admin.getUserById(id);
 const user=data?.user;
 if(error||!user)throw new Error("Kunne ikke opprette sikker innlogging.");
 let version=readSessionVersion(user);
 if(version)return version;
 version=createSessionVersion();
 const metadata={...(user.app_metadata||{}),[SESSION_VERSION_FIELD]:version};
 const {error:updateError}=await s.auth.admin.updateUserById(id,{app_metadata:metadata});
 if(updateError)throw new Error("Kunne ikke opprette sikker innlogging.");
 return version;
}

export async function setCustomerCookie(id){
 const s=db();
 if(!s)throw new Error("Databasen er ikke tilgjengelig.");
 const version=await ensureSessionVersion(s,id);
 const expiresAt=Math.floor(Date.now()/1000)+SESSION_MAX_AGE;
 const c=await cookies();
 c.set(COOKIE,id+"."+version+"."+expiresAt+"."+sign(id,version,expiresAt),{
  httpOnly:true,
  secure:process.env.NODE_ENV==="production",
  sameSite:"lax",
  path:"/",
  maxAge:SESSION_MAX_AGE
 });
}

export async function clearCustomerCookie(){
 const c=await cookies();
 c.delete(COOKIE);
}

export async function getCustomerUserId(){
 try{
  const c=await cookies();
  const session=parseSession(c.get(COOKIE)?.value||"");
  if(!session)return null;
  const s=db();
  if(!s)return null;
  const {data,error}=await s.auth.admin.getUserById(session.id);
  const user=data?.user;
  if(error||!user||!user.email_confirmed_at)return null;
  return sameSessionVersion(session.version,readSessionVersion(user))?session.id:null;
 }catch(e){
  console.error("CUSTOMER SESSION",e);
  return null;
 }
}

export async function getCustomer(){
 const id=await getCustomerUserId();
 if(!id)return null;
 const s=db();
 if(!s)return null;
 const {data,error}=await s.from("customer_profiles").select("*").eq("id",id).maybeSingle();
 if(error||!data)return null;
 return {id:data.id,email:data.email,name:data.name||"",phone:data.phone||"",address:data.address||""};
}
