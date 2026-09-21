import crypto from "crypto";
import {cookies} from "next/headers";
import {db} from "./supabase";
const COOKIE="aadland_customer";
function secret(){const v=process.env.SESSION_SECRET;if(!v)throw new Error("SESSION_SECRET mangler.");return v}
function sign(id){return crypto.createHmac("sha256",secret()).update("customer:"+id).digest("hex")}
export async function setCustomerCookie(id){const c=await cookies();c.set(COOKIE,id+"."+sign(id),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30})}
export async function clearCustomerCookie(){const c=await cookies();c.delete(COOKIE)}
export async function getCustomerUserId(){const c=await cookies(),v=c.get(COOKIE)?.value||"",dot=v.indexOf(".");if(dot<1)return null;const id=v.slice(0,dot),sig=v.slice(dot+1),expected=sign(id),a=Buffer.from(sig),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b)?id:null}
export async function getCustomer(){const id=await getCustomerUserId();if(!id)return null;const s=db();if(!s)return null;const {data,error}=await s.from("customer_profiles").select("*").eq("id",id).maybeSingle();if(error||!data)return null;return {id:data.id,email:data.email,name:data.name||"",phone:data.phone||"",address:data.address||""}}
