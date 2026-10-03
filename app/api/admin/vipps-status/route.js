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
 let captureAlerts=[];
 if(s){
  const {data,error}=await s.rpc("get_vipps_webhook_status",{target_environment:env});
  if(error)console.error("VIPPS STATUS WEBHOOK LOOKUP",error);
  else if(Array.isArray(data))webhooks=data;

  const [ordersResult,rentalsResult]=await Promise.all([
   s.from("orders")
    .select("id,order_number,total_ore,payment_reserved_ore,payment_captured_ore,payment_capture_guaranteed_until")
    .eq("payment_provider","vipps")
    .eq("payment_status","authorized")
    .not("payment_capture_guaranteed_until","is",null)
    .order("payment_capture_guaranteed_until",{ascending:true})
    .limit(100),
   s.from("rental_bookings")
    .select("id,booking_number,total_ore,payment_reserved_ore,payment_captured_ore,payment_capture_guaranteed_until")
    .eq("payment_provider","vipps")
    .eq("payment_status","authorized")
    .not("payment_capture_guaranteed_until","is",null)
    .order("payment_capture_guaranteed_until",{ascending:true})
    .limit(100)
  ]);

  if(ordersResult.error)console.error("VIPPS STATUS ORDER CAPTURE ALERTS",ordersResult.error);
  if(rentalsResult.error)console.error("VIPPS STATUS RENTAL CAPTURE ALERTS",rentalsResult.error);

  const now=Date.now();
  const warnUntil=now+48*60*60*1000;
  captureAlerts=[
   ...(ordersResult.data||[]).map(row=>({
    unit:"service",
    id:row.id,
    reference:row.order_number,
    totalOre:Number(row.total_ore)||0,
    reservedOre:Number(row.payment_reserved_ore)||0,
    capturedOre:Number(row.payment_captured_ore)||0,
    deadline:row.payment_capture_guaranteed_until
   })),
   ...(rentalsResult.data||[]).map(row=>({
    unit:"rental",
    id:row.id,
    reference:row.booking_number,
    totalOre:Number(row.total_ore)||0,
    reservedOre:Number(row.payment_reserved_ore)||0,
    capturedOre:Number(row.payment_captured_ore)||0,
    deadline:row.payment_capture_guaranteed_until
   }))
  ]
   .map(item=>{
    const deadlineMs=new Date(item.deadline).getTime();
    return {
     ...item,
     expired:Number.isFinite(deadlineMs)&&deadlineMs<=now,
     urgent:Number.isFinite(deadlineMs)&&deadlineMs<=warnUntil
    };
   })
   .filter(item=>item.urgent)
   .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline))
   .slice(0,50);
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
  captureAlerts,
  note:"API-nøkler og webhook-secrets vises aldri her. Webhook-secrets lagres i privat database."
 });
}
