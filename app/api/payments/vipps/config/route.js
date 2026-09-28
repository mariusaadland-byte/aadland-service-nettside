import {NextResponse} from "next/server";
import {vippsPublicStatus} from "../../../../../lib/vipps";
import {db} from "../../../../../lib/supabase";

export const dynamic="force-dynamic";

export async function GET(){
 const status=vippsPublicStatus();
 let webhookReady=false;
 if(status.enabled){
  const s=db();
  if(s){
   const {data,error}=await s.rpc("has_active_vipps_webhook_registration",{target_environment:status.environment});
   if(!error)webhookReady=data===true;
   else console.error("VIPPS PUBLIC WEBHOOK READINESS ERROR",error);
  }
 }
 const enabled=status.enabled&&webhookReady;
 return NextResponse.json({
  ...status,
  enabled,
  webhookReady,
  reason:status.enabled&&!webhookReady?"webhook_missing":status.reason
 },{
  headers:{"Cache-Control":"private, no-store, max-age=0"}
 });
}
