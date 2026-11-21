import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {verifyQuoteToken} from "../../../../lib/quoteLinks";
import {getCustomer} from "../../../../lib/customer-auth";
import {osloDateKey} from "../../../../lib/osloTime";
import {dispatchQueuedQuoteResponseNotices,getQuoteResponseNoticeSummary} from "../../../../lib/quoteResponseNotices";

export const runtime="nodejs";
export const maxDuration=60;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function mapQuote(q){
 return {
  id:q.id,
  quoteNumber:q.quote_number,
  status:q.status||"draft",
  title:q.title||"",
  customer:q.customer||{},
  lineItems:Array.isArray(q.line_items)?q.line_items:[],
  paymentPlan:Array.isArray(q.payment_plan)?q.payment_plan:[],
  subtotalExVatOre:Number(q.subtotal_ex_vat_ore)||0,
  vatOre:Number(q.vat_ore)||0,
  totalIncVatOre:Number(q.total_inc_vat_ore)||0,
  introText:q.intro_text||"",
  notes:q.notes||"",
  terms:q.terms||"",
  validUntil:q.valid_until||null,
  plannedStartDate:q.planned_start_date||null,
  revisionNumber:Number(q.revision_number)||1,
  revisedFromId:q.revised_from_id||null,
  supersededById:q.superseded_by_id||null,
  supersededAt:q.superseded_at||null,
  issuedVia:q.issued_via||null,
  paperIssuedAt:q.paper_issued_at||null,
  acceptanceMethod:q.acceptance_method||null,
  paperSignedDate:q.paper_signed_date||null,
  sentAt:q.sent_at||null,
  acceptedAt:q.accepted_at||null,
  declinedAt:q.declined_at||null,
  createdAt:q.created_at
 };
}

async function loadQuote(id){
 const s=db();
 if(!s)return {error:"Databasen er ikke tilgjengelig.",status:503};
 const {data,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!data)return {error:"Tilbudet ble ikke funnet.",status:404};
 return {s,data};
}

function expired(quote){
 if(!quote.valid_until)return false;
 const today=osloDateKey(new Date());
 return String(quote.valid_until).slice(0,10)<today;
}

// An authenticated Min side account can see its own historic issued quotes,
// even after the PUBLIC email link has expired or been revoked.
// A forwarded email link alone must never grant this account access.
async function customerOwnsIssuedQuote(quote){
 if(!quote||quote.status==="draft"||(!quote.sent_at&&!quote.paper_issued_at&&!quote.accepted_at&&!quote.declined_at))return false;
 const customer=await getCustomer();
 const profileEmail=String(customer?.email||"").trim().toLowerCase();
 const quoteEmail=String(quote.customer?.email||"").trim().toLowerCase();
 return Boolean(profileEmail&&quoteEmail&&profileEmail===quoteEmail);
}
const privateHeaders={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer"};

export async function GET(req,{params}){
 const resolved=await params;
 const id=String(resolved?.id||"").trim();
 const token=String(req.headers.get("x-quote-token")||new URL(req.url).searchParams.get("token")||"");
 const loaded=await loadQuote(id);
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status});
 const publicLinkOk=verifyQuoteToken(loaded.data,token);
 if(!publicLinkOk&&!(await customerOwnsIssuedQuote(loaded.data)))
  return NextResponse.json({error:"Tilbudslenken er utløpt eller sperret. Logg inn på Min side for å se din tilbudshistorikk."},{status:403,headers:privateHeaders});
 const quote=mapQuote(loaded.data);
 return NextResponse.json({quote:{...quote,isExpired:expired(loaded.data)}},{headers:privateHeaders});
}

export async function POST(req,{params}){ const originError=sameOriginGuard(req); if(originError)return originError;
 const resolved=await params;
 const id=String(resolved?.id||"").trim();
 const body=await req.json().catch(()=>({}));
 const token=String(body.token||"");
 const action=String(body.action||"");
 if(!["accept","decline"].includes(action))return NextResponse.json({error:"Ugyldig handling."},{status:400});

 const loaded=await loadQuote(id);
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status});
 const publicLinkOk=verifyQuoteToken(loaded.data,token);
 const authenticatedOwner=!publicLinkOk&&await customerOwnsIssuedQuote(loaded.data);
 if(!publicLinkOk&&!authenticatedOwner)
  return NextResponse.json({error:"Tilbudslenken er utløpt eller sperret. Logg inn på Min side for å se egne tilbud."},{status:403,headers:privateHeaders});

 // A repeated click on the same recorded answer returns the canonical status;
 // it never writes the quote twice and never sends a new confirmation.
 const expected=action==="accept"?"accepted":"declined";
 if(loaded.data.status===expected){
  const notifications=await getQuoteResponseNoticeSummary(loaded.s,id);
  return NextResponse.json({quote:{...mapQuote(loaded.data),isExpired:expired(loaded.data)},
   alreadyRecorded:true,notifications,confirmationPending:notifications.owner!=="sent"||
     Boolean(loaded.data.customer?.email&&notifications.customer!=="sent")},{headers:privateHeaders});
 }
 if(["accepted","declined","cancelled","superseded"].includes(loaded.data.status))
  return NextResponse.json({error:loaded.data.status==="superseded"?"Denne tilbudsversjonen er erstattet av en nyere revisjon.":"Tilbudet er allerede ferdigbehandlet."},{status:409,headers:privateHeaders});
 if(loaded.data.status!=="sent")return NextResponse.json({error:"Tilbudet er ikke aktivt for svar ennå."},{status:409});
 if(expired(loaded.data))return NextResponse.json({error:"Tilbudet er utløpt."},{status:409});

 // Preview must not mutate live quote decisions or send genuine customer mail.
 if(process.env.VERCEL_ENV!=="production")
  return NextResponse.json({error:"Digital godkjenning og bekreftelse er bare aktiv i produksjon."},{status:403,headers:privateHeaders});

 // One atomic database RPC updates the quote and creates each recipient's
 // private outbox row. On ANY outbox insertion failure the acceptance rolls
 // back, so no response becomes silently untracked.
 const stored=await loaded.s.rpc("record_customer_quote_response",{
  p_quote_id:id,p_action:action,
  p_expected_generation:Number(loaded.data.quote_link_generation||1),
  p_via_customer_session:Boolean(authenticatedOwner)
 });
 if(stored.error){
  console.error("QUOTE RESPONSE ATOMIC RECORD FAILED",{quoteId:id,code:stored.error.code});
  return NextResponse.json({error:"Svaret kunne ikke lagres sikkert med bekreftelseshistorikk. Prøv igjen."},{status:503,headers:privateHeaders});
 }
 const data=stored.data;
 if(!data)return NextResponse.json({error:"Tilbudet ble endret eller utløp før svaret ble registrert. Oppdater siden."},{status:409,headers:privateHeaders});

 // Dispatch after the transactional quote+outbox commit. If Vercel dies
 // here, the cron will send only untouched 'queued' rows; 'claimed' and
 // 'needs_review' rows are never resent without owner's manual review.
 try{
  const sent=await dispatchQueuedQuoteResponseNotices(loaded.s,{quoteId:id,limit:2});
  if(!sent.ok)console.error("QUOTE RESPONSE DISPATCH QUEUE READ FAILED",{quoteId:id});
 }catch{
  console.error("QUOTE RESPONSE DISPATCH INTERRUPTED",{quoteId:id});
 }
 const notifications=await getQuoteResponseNoticeSummary(loaded.s,id);
 const confirmationPending=notifications.owner!=="sent"||
  Boolean(data.customer?.email&&notifications.customer!=="sent");
 return NextResponse.json({quote:{...mapQuote(data),isExpired:expired(data)},
  notifications,confirmationPending,alreadyRecorded:false},{headers:privateHeaders});
}
