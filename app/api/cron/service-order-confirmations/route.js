import {NextResponse} from "next/server";
import {withServiceCronMonitoring} from "../../../../lib/serviceCronMonitor";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";
import {sendManualOrderConfirmationOnce} from "../../../../lib/manualOrderConfirmationOnce";
export const runtime="nodejs";
export const maxDuration=60;
async function runServiceCron(req){
 const guard=cronGuard(req);if(guard)return guard;
 if(process.env.VERCEL_ENV!=="production"||!process.env.RESEND_API_KEY)return NextResponse.json({ok:false,error:"Utsending er ikke tilgjengelig."},{status:503});
 const s=db();if(!s)return NextResponse.json({ok:false},{status:503});
 const cutoff=new Date(Date.now()-5*60*1000).toISOString();
 const {data,error}=await s.from("service_order_confirmation_outbox").select("order_id").eq("state","queued").lt("created_at",cutoff).order("created_at",{ascending:true}).limit(10);
 if(error)return NextResponse.json({ok:false},{status:503});
 let accepted=0,review=0,failed=0;
 for(const row of data||[]){
  try{const result=await sendManualOrderConfirmationOnce({s,id:row.order_id});if(result.state==="accepted")accepted++;else if(result.state==="needs_review")review++;else if(result.state==="unavailable")failed++;}
  catch{failed++;}
 }
 return NextResponse.json({ok:failed===0,checked:(data||[]).length,accepted,review,failed},{status:failed?503:200,headers:{"Cache-Control":"no-store"}});
}

export async function GET(req){return withServiceCronMonitoring("service-order-confirmations",req,()=>runServiceCron(req));}
