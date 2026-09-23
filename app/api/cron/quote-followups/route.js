import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {createQuoteToken} from "../../../../lib/quoteLinks";

const MAX_PER_RUN=25;
const TWO_DAYS_MS=48*60*60*1000;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function authorized(req){
 const secret=String(process.env.CRON_SECRET||"").trim();
 const authorization=String(req.headers.get("authorization")||"");
 if(secret)return authorization===("Bearer "+secret);
 const ua=String(req.headers.get("user-agent")||"").toLowerCase();
 return ua.startsWith("vercel-cron/");
}

function baseUrl(req){
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 return configured||new URL(req.url).origin||"https://www.aadland-service.no";
}

export async function GET(req){
 if(!authorized(req))return NextResponse.json({error:"Ingen tilgang."},{status:401});

 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({ok:false,error:"RESEND_API_KEY mangler."},{status:503});

 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 const cutoff=new Date(Date.now()-TWO_DAYS_MS).toISOString();
 const today=new Date().toISOString().slice(0,10);

 const {data,error}=await s.from("quotes")
  .select("id,quote_number,title,status,customer,total_inc_vat_ore,valid_until,sent_at,follow_up_sent_at,auto_follow_up,archived_at")
  .eq("status","sent")
  .eq("auto_follow_up",true)
  .is("follow_up_sent_at",null)
  .is("archived_at",null)
  .lte("sent_at",cutoff)
  .or("valid_until.is.null,valid_until.gte."+today)
  .order("sent_at",{ascending:true})
  .limit(MAX_PER_RUN);

 if(error){
  if(["42703","42P01"].includes(String(error.code||""))){
   return NextResponse.json({ok:true,setupRequired:true,sent:0,message:"quote_followups.sql er ikke kjørt ennå."});
  }
  console.error("QUOTE FOLLOWUP QUERY",error);
  return NextResponse.json({ok:false,error:"Tilbudene kunne ikke hentes."},{status:500});
 }

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const base=baseUrl(req);
 let sentCount=0;
 const failures=[];

 for(const quote of data||[]){
  const email=String(quote.customer?.email||"").trim().toLowerCase();
  if(!email)continue;

  const claimedAt=new Date().toISOString();
  const {data:claimed,error:claimError}=await s.from("quotes")
   .update({follow_up_sent_at:claimedAt,updated_at:claimedAt})
   .eq("id",quote.id)
   .eq("status","sent")
   .eq("auto_follow_up",true)
   .is("follow_up_sent_at",null)
   .select("id")
   .maybeSingle();

  if(claimError||!claimed){
   if(claimError)console.error("QUOTE FOLLOWUP CLAIM",quote.id,claimError);
   continue;
  }

  try{
   const token=createQuoteToken(quote);
   const link=base+"/tilbud/"+encodeURIComponent(quote.id)+"?token="+encodeURIComponent(token);
   const customerName=esc(quote.customer?.name||"kunde");
   const title=esc(quote.title||"tilbudet");
   const number=esc(quote.quote_number||"");
   const valid=quote.valid_until?new Date(quote.valid_until+"T12:00:00").toLocaleDateString("nb-NO"):"";

   const html=`<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #ded7cb">
<tr><td style="padding:28px 30px;background:#11100e;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">AUTOMATISK OPPFØLGING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">TILBUD ${number}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px">Har tilbudet kommet frem?</h1>
<p style="color:#625d55;line-height:1.65;margin:0 0 16px">Hei ${customerName}. Dette er en automatisk oppfølging fra Aadland Service. Vi vil bare sjekke at tilbudet om <b>${title}</b> kom frem til deg.</p>
<p style="color:#625d55;line-height:1.65;margin:0 0 20px">Du trenger ikke svare dersom du fortsatt vurderer tilbudet. Har du spørsmål, kan du svare direkte på denne e-posten.</p>
${valid?`<p style="color:#777;font-size:12px;margin:0 0 18px">Tilbudet er gyldig til ${esc(valid)}.</p>`:""}
<a href="${esc(link)}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Åpne tilbud →</a>
<p style="margin:26px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Denne meldingen sendes bare én gang automatisk dersom tilbudet fortsatt står ubesvart etter omtrent to døgn.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

   const result=await resend.emails.send({
    from:"Aadland Service <post@aadland-service.no>",
    to:email,
    replyTo:"post@aadland-service.no",
    subject:"Har du mottatt tilbud "+quote.quote_number+"? – Aadland Service",
    html
   });
   if(result?.error)throw new Error(result.error.message||"E-postfeil");
   sentCount+=1;
  }catch(sendError){
   failures.push({id:quote.id,error:String(sendError?.message||sendError||"Ukjent feil").slice(0,180)});
   console.error("QUOTE FOLLOWUP EMAIL",quote.id,sendError);
   await s.from("quotes").update({follow_up_sent_at:null,updated_at:new Date().toISOString()}).eq("id",quote.id).eq("follow_up_sent_at",claimedAt);
  }
 }

 return NextResponse.json({ok:true,checked:(data||[]).length,sent:sentCount,failed:failures.length,failures});
}
