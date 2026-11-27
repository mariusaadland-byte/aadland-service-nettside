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
 const staleCutoff=new Date(Date.now()-10*60*1000).toISOString();
 const [held,stale,queued]=await Promise.all([
  s.from("service_order_confirmation_outbox").select("order_id",{count:"exact",head:true}).eq("state","needs_review"),
  s.from("service_order_confirmation_outbox").select("order_id",{count:"exact",head:true}).eq("state","claimed").lt("claimed_at",staleCutoff),
  s.from("service_order_confirmation_outbox").select("order_id",{count:"exact",head:true}).eq("state","queued").lt("created_at",cutoff)
 ]);
 if([held,stale,queued].some(x=>x.error||!Number.isSafeInteger(x.count)||x.count<0))
  return NextResponse.json({ok:false,error:"Ordrebekreftelseskøen kunne ikke kontrolleres.",accepted},{status:503,headers:{"Cache-Control":"no-store"}});
 const requiresReview=Math.max(review,held.count+stale.count);
 return NextResponse.json({ok:failed===0&&requiresReview===0&&queued.count===0,checked:(data||[]).length,accepted,review,failed,requiresReview,held:held.count,staleClaims:stale.count,remainingQueued:queued.count},{status:failed?503:requiresReview||queued.count?207:200,headers:{"Cache-Control":"no-store"}});
}

export async function GET(req){return withServiceCronMonitoring("service-order-confirmations",req,()=>runServiceCron(req));}
