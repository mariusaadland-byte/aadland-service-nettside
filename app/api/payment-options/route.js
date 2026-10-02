import {NextResponse} from "next/server";
import {db} from "../../../lib/supabase";
import {vippsPublicStatus} from "../../../lib/vippsConfig";
import {vippsPaymentsEnabled} from "../../../lib/vippsClient";

export const runtime="nodejs";

export async function GET(){
 const enabled=vippsPaymentsEnabled();
 if(!enabled)return NextResponse.json({vipps:{service:false,rental:false}});

 const s=db();
 if(!s)return NextResponse.json({vipps:{service:false,rental:false}});

 const env=String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
 const {data:webhooks,error}=await s.rpc("get_vipps_webhook_status",{target_environment:env});
 if(error){
  console.error("PUBLIC PAYMENT OPTIONS WEBHOOK STATUS",error);
  return NextResponse.json({vipps:{service:false,rental:false}});
 }

 const active=new Set((Array.isArray(webhooks)?webhooks:[])
  .filter(item=>item?.active!==false&&["service","rental"].includes(item?.unit))
  .map(item=>item.unit));
 const units=vippsPublicStatus();
 const ready=unit=>{
  const config=units.find(item=>item.unit===unit);
  return Boolean(config?.configured&&active.has(unit));
 };

 return NextResponse.json({
  vipps:{
   service:ready("service"),
   rental:ready("rental")
  }
 });
}
