import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {verifyQuoteToken} from "../../../../lib/quoteLinks";

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
   const customerEmail=String(data.customer?.email||"").trim().toLowerCase();
   const customerName=String(data.customer?.name||"Kunde");
   const accepted=action==="accept";
   const totalText=new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(data.total_inc_vat_ore)||0)/100);
   await resend.emails.send({
    from,
    to,
    replyTo:customerEmail||undefined,
    subject:(accepted?"Tilbud godkjent – ":"Tilbud avslått – ")+data.quote_number,
    text:[
     customerName+" har "+(accepted?"godkjent":"avslått")+" tilbud "+data.quote_number+".",
     "",
     "Tilbud: "+data.title,
     "Total inkl. MVA: "+totalText,
     data.customer?.phone?"Telefon: "+data.customer.phone:"",
     customerEmail?"E-post: "+customerEmail:""
    ].filter(Boolean).join("\n")
   });

   if(customerEmail){
    const requestOrigin=new URL(req.url).origin;
    const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
    const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
    let hasCustomerAccount=false;
    try{
     const {data:profile}=await loaded.s.from("customer_profiles").select("id").eq("email",customerEmail).maybeSingle();
     hasCustomerAccount=Boolean(profile?.id);
    }catch{}
    const minSideUrl=base+"/min-side";
    const plannedStart=data.planned_start_date?new Date(data.planned_start_date+"T12:00:00").toLocaleDateString("nb-NO"):"";
    const customerHtml=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">TILBUD ${esc(data.quote_number)}</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${accepted?"GODKJENT":"AVSLÅTT"}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${accepted?"Takk – tilbudet er godkjent":"Tilbakemeldingen er registrert"}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(customerName)}. ${accepted?"Vi har registrert at du har godkjent tilbudet om "+esc(data.title)+". Vi tar kontakt om videre plan og endelig oppstart.":"Vi har registrert at du har avslått tilbudet om "+esc(data.title)+". Takk for tilbakemeldingen."}</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">Total inkl. MVA</div><div style="margin-top:5px;color:#fff;font-size:22px;font-weight:900">${esc(totalText)}</div>
${accepted&&plannedStart?`<div style="margin-top:12px;color:#8e887f;font-size:11px">Tidligst oppstart</div><div style="margin-top:4px;color:#fff;font-weight:800">${esc(plannedStart)}</div>`:""}
</div>
${hasCustomerAccount?`<a href="${esc(minSideUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">${accepted?"Du kan svare direkte på denne e-posten dersom noe må avklares før oppstart.":"Hvis du ønsker å ta opp tilbudet igjen senere, kan du svare direkte på denne e-posten."}</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

    await resend.emails.send({
     from,
     to:customerEmail,
     replyTo:"post@aadland-service.no",
     subject:accepted?"Bekreftelse: tilbud "+data.quote_number+" er godkjent":"Bekreftelse: tilbud "+data.quote_number+" er avslått",
     html:customerHtml
    });
   }
  }catch(notificationError){
   console.error("QUOTE RESPONSE NOTIFICATION ERROR",notificationError);
  }
 }

 return NextResponse.json({quote:{...mapQuote(data),isExpired:expired(data)}});
}
