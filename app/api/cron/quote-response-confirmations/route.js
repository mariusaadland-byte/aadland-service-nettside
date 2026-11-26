import {NextResponse} from "next/server";
import {withServiceCronMonitoring} from "../../../../lib/serviceCronMonitor";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";
import {dispatchQueuedQuoteResponseNotices} from "../../../../lib/quoteResponseNotices";

export const runtime="nodejs";
export const maxDuration=60;

// Never touch quote state, and never retry 'claimed' or 'needs_review' rows.
// An interrupted POST only leaves 'queued' first-time deliveries for this
// watchdog, which runs after all normal customer requests have had time to finish.
async function runServiceCron(req){
 const guard=cronGuard(req);if(guard)return guard;
 if(process.env.VERCEL_ENV!=="production")
  return NextResponse.json({ok:false,error:"Varsler kjøres bare i produksjon."},{status:403});
 if(!process.env.RESEND_API_KEY)
  return NextResponse.json({ok:false,error:"E-post er ikke konfigurert."},{status:503});
 const s=db();if(!s)return NextResponse.json({ok:false,error:"Database er utilgjengelig."},{status:503});
 const result=await dispatchQueuedQuoteResponseNotices(s,{limit:25});
 if(!result.ok)return NextResponse.json(result,{status:503});
 // Also report unresolved deliveries from earlier runs. Never requeue them.
 const cutoff=new Date(Date.now()-10*60*1000).toISOString();
 const [held,stale,queued]=await Promise.all([
  s.from("quote_response_notifications").select("id",{count:"exact",head:true}).eq("state","needs_review"),
  s.from("quote_response_notifications").select("id",{count:"exact",head:true}).eq("state","claimed").lt("claimed_at",cutoff),
  s.from("quote_response_notifications").select("id",{count:"exact",head:true}).eq("state","queued")
 ]);
 if([held,stale,queued].some(x=>x.error||!Number.isSafeInteger(x.count)||x.count<0))
  return NextResponse.json({ok:false,error:"Kunne ikke kontrollere gjenstående bekreftelser.",checked:result.checked,sent:result.sent},{status:503,headers:{"Cache-Control":"no-store"}});
 const requiresReview=Math.max(result.requiresReview,held.count+stale.count);
 return NextResponse.json({ok:true,checked:result.checked,sent:result.sent,
  requiresReview,held:held.count,staleClaims:stale.count,remainingQueued:queued.count},{
  status:requiresReview||queued.count?207:200,
  headers:{"Cache-Control":"no-store"}
 });
}

export async function GET(req){return withServiceCronMonitoring("quote-response-confirmations",req,()=>runServiceCron(req));}
