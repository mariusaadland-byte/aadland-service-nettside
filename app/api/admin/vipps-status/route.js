import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {vippsPublicStatus} from "../../../../lib/vippsConfig";
import {db} from "../../../../lib/supabase";
import {vippsPaymentsEnabled} from "../../../../lib/vippsClient";

export const runtime="nodejs";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return false;
 return user.role==="owner"||await hasPermission("canUpdateOrders");
}

export async function GET(){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const env=String(process.env.VIPPS_ENV||"production").trim().toLowerCase()==="test"?"test":"production";
 const s=db();
 let webhooks=[];
 if(s){
  const {data,error}=await s.rpc("get_vipps_webhook_status",{target_environment:env});
  if(error)console.error("VIPPS STATUS WEBHOOK LOOKUP",error);
  else if(Array.isArray(data))webhooks=data;
 }
 return NextResponse.json({
  environment:env,
  enabled:vippsPaymentsEnabled(),
  units:vippsPublicStatus().map(unit=>({
   ...unit,
   webhook:webhooks.find(item=>item?.unit===unit.unit)||null
  })),
  paymentIntegrationFoundation:true,
  paymentIntegrationImplemented:false,
  note:"API-nøkler og webhook-secrets vises aldri her. Webhook-secrets lagres i privat database."
 });
}
