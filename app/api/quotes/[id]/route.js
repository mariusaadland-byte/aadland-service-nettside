import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {verifyQuoteToken} from "../../../../lib/quoteLinks";

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
 const today=new Date().toISOString().slice(0,10);
 return quote.valid_until<today;
}

export async function GET(req,{params}){
 const resolved=await params;
 const id=String(resolved?.id||"").trim();
 const token=new URL(req.url).searchParams.get("token")||"";
 const loaded=await loadQuote(id);
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status});
 if(!verifyQuoteToken(loaded.data,token))return NextResponse.json({error:"Ugyldig eller utløpt tilbudslenke."},{status:403});
 const quote=mapQuote(loaded.data);
 return NextResponse.json({quote:{...quote,isExpired:expired(loaded.data)}});
}

export async function POST(req,{params}){
 const resolved=await params;
 const id=String(resolved?.id||"").trim();
 const body=await req.json().catch(()=>({}));
 const token=String(body.token||"");
 const action=String(body.action||"");
 if(!["accept","decline"].includes(action))return NextResponse.json({error:"Ugyldig handling."},{status:400});

 const loaded=await loadQuote(id);
 if(loaded.error)return NextResponse.json({error:loaded.error},{status:loaded.status});
 if(!verifyQuoteToken(loaded.data,token))return NextResponse.json({error:"Ugyldig eller utløpt tilbudslenke."},{status:403});

 if(["accepted","declined","cancelled"].includes(loaded.data.status)){
  return NextResponse.json({error:"Tilbudet er allerede ferdigbehandlet."},{status:409});
 }
 if(expired(loaded.data))return NextResponse.json({error:"Tilbudet er utløpt."},{status:409});

 const now=new Date().toISOString();
 const patch=action==="accept"
  ?{status:"accepted",accepted_at:now,declined_at:null,updated_at:now}
  :{status:"declined",declined_at:now,accepted_at:null,updated_at:now};

 const {data,error}=await loaded.s.from("quotes").update(patch).eq("id",id).select("*").single();
 if(error)return NextResponse.json({error:"Svaret kunne ikke lagres."},{status:500});

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(resendKey){
  try{
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const from="Aadland Service <post@aadland-service.no>";
   const to="post@aadland-service.no";
   const customerName=String(data.customer?.name||"Kunde");
   const accepted=action==="accept";
   await resend.emails.send({
    from,
    to,
    replyTo:String(data.customer?.email||"").trim()||undefined,
    subject:(accepted?"Tilbud godkjent – ":"Tilbud avslått – ")+data.quote_number,
    text:[
     customerName+" har "+(accepted?"godkjent":"avslått")+" tilbud "+data.quote_number+".",
     "",
     "Tilbud: "+data.title,
     "Total inkl. MVA: "+new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(data.total_inc_vat_ore)||0)/100),
     data.customer?.phone?"Telefon: "+data.customer.phone:"",
     data.customer?.email?"E-post: "+data.customer.email:""
    ].filter(Boolean).join("\n")
   });
  }catch(notificationError){
   console.error("QUOTE RESPONSE NOTIFICATION ERROR",notificationError);
  }
 }

 return NextResponse.json({quote:{...mapQuote(data),isExpired:expired(data)}});
}
