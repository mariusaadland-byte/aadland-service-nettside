import "server-only";
import crypto from "crypto";
import {NextResponse} from "next/server";
import {db} from "./supabase";

function secret(){
 return String(process.env.RATE_LIMIT_SECRET||process.env.SESSION_SECRET||"").trim();
}

function keyedHash(scope,value){
 const key=secret();
 if(!key)return null;
 return crypto.createHmac("sha256",key).update(scope+":"+String(value||"")).digest("hex");
}

function clientKey(req,scope){
 const forwarded=String(req.headers.get("x-forwarded-for")||"").split(",")[0].trim();
 const real=String(req.headers.get("x-real-ip")||"").trim();
 const ua=String(req.headers.get("user-agent")||"").trim().slice(0,120);
 const client=forwarded||real||("unknown:"+ua);
 return keyedHash(scope,client);
}

export async function rateLimitRequest(req,{scope,max,windowSeconds,message="For mange forsøk. Prøv igjen senere."}){
 const key=clientKey(req,scope);
 if(!key){
  console.error("RATE LIMIT SECRET MISSING",scope);
  return null;
 }

 const s=db();
 if(!s)return null;

 const {data,error}=await s.rpc("consume_app_rate_limit",{
  bucket_key:key,
  max_requests:max,
  window_seconds:windowSeconds
 });

 if(error){
  console.error("RATE LIMIT ERROR",scope,error);
  return null;
 }

 if(data?.allowed===false){
  const retryAfter=Math.max(1,Number(data.retry_after)||windowSeconds);
  return NextResponse.json(
   {error:message},
   {status:429,headers:{"Retry-After":String(retryAfter)}}
  );
 }

 return null;
}


export async function rateLimitValue(value,{scope,max,windowSeconds,message="For mange forespørsler. Prøv igjen senere."}){
 const key=keyedHash(scope,String(value||"").trim().toLowerCase());
 if(!key){
  console.error("RATE LIMIT SECRET MISSING",scope);
  return null;
 }

 const s=db();
 if(!s)return null;

 const {data,error}=await s.rpc("consume_app_rate_limit",{
  bucket_key:key,
  max_requests:max,
  window_seconds:windowSeconds
 });

 if(error){
  console.error("RATE LIMIT ERROR",scope,error);
  return null;
 }

 if(data?.allowed===false){
  const retryAfter=Math.max(1,Number(data.retry_after)||windowSeconds);
  return NextResponse.json(
   {error:message},
   {status:429,headers:{"Retry-After":String(retryAfter)}}
  );
 }

 return null;
}
