import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";
import {dispatchQueuedQuoteResponseNotices} from "../../../../lib/quoteResponseNotices";

export const runtime="nodejs";
export const maxDuration=60;

// Never touch quote state, and never retry 'claimed' or 'needs_review' rows.
// An interrupted POST only leaves 'queued' first-time deliveries for this
// watchdog, which runs after all normal customer requests have had time to finish.
export async function GET(req){
 const guard=cronGuard(req);if(guard)return guard;
 if(process.env.VERCEL_ENV!=="production")
  return NextResponse.json({ok:false,error:"Varsler kjøres bare i produksjon."},{status:403});
 if(!process.env.RESEND_API_KEY)
  return NextResponse.json({ok:false,error:"E-post er ikke konfigurert."},{status:503});
 const s=db();if(!s)return NextResponse.json({ok:false,error:"Database er utilgjengelig."},{status:503});
 const result=await dispatchQueuedQuoteResponseNotices(s,{limit:25});
 if(!result.ok)return NextResponse.json(result,{status:503});
 return NextResponse.json({ok:true,checked:result.checked,sent:result.sent,
  requiresReview:result.requiresReview},{
  status:result.requiresReview?207:200,
  headers:{"Cache-Control":"no-store"}
 });
}
