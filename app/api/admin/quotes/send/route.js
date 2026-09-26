import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {createQuoteToken} from "../../../../../lib/quoteLinks";
import {osloDateKey} from "../../../../../lib/osloTime";

const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return (user.role==="owner"||user.canUpdateOrders||user.canManageProducts)?user:null;
}

export async function POST(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const {id}=await req.json().catch(()=>({}));
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});

 if(["accepted","declined","cancelled"].includes(quote.status))return NextResponse.json({error:"Dette tilbudet er ferdigbehandlet og kan ikke sendes på nytt."},{status:409});
 const today=osloDateKey(new Date());
 if(quote.valid_until&&quote.valid_until<today)return NextResponse.json({error:"Tilbudet har passert gyldighetsdatoen. Oppdater datoen før du sender det."},{status:409});
 const email=String(quote.customer?.email||"").trim();
 if(!email)return NextResponse.json({error:"Kunden må ha e-postadresse før tilbudet kan sendes."},{status:400});
 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"E-post er ikke konfigurert på serveren."},{status:503});

 const token=createQuoteToken(quote);
 const requestOrigin=new URL(req.url).origin;
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin||"https://www.aadland-service.no");
 const link=base+"/tilbud/"+encodeURIComponent(quote.id)+"?token="+encodeURIComponent(token);
 const valid=quote.valid_until?new Date(quote.valid_until+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const plannedStart=quote.planned_start_date?new Date(quote.planned_start_date+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const from="Aadland Service <post@aadland-service.no>";
 const replyTo="post@aadland-service.no";
 const customerName=esc(quote.customer?.name||"");
 const title=esc(quote.title||"Tilbud");
 const number=esc(quote.quote_number||"");
 const total=nok(quote.total_inc_vat_ore);
 const minSideUrl=base+"/min-side";
 let hasCustomerAccount=false;
 try{
  const {data:profile}=await s.from("customer_profiles").select("id").eq("email",email.toLowerCase()).maybeSingle();
  hasCustomerAccount=Boolean(profile?.id);
 }catch{}

 const rows=(Array.isArray(quote.line_items)?quote.line_items:[]).slice(0,20).map(line=>{
  const lineTotal=(Number(line.quantity)||0)*(Number(line.unitPriceOre??line.unit_price_ore)||0);
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #ece7df;color:#26231f">${esc(line.description||"")}</td>
    <td style="padding:10px 0;border-bottom:1px solid #ece7df;text-align:right;color:#26231f">${esc(line.quantity)} ${esc(line.unit||"")}</td>
    <td style="padding:10px 0;border-bottom:1px solid #ece7df;text-align:right;color:#26231f">${nok(lineTotal)}</td>
  </tr>`;
 }).join("");

 const html=`<!doctype html>
<html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #ded7cb">
<tr><td style="padding:28px 30px;background:#11100e;color:#fff">
 <div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div>
 <div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">HÅNDVERK · VEDLIKEHOLD · UTLEIE</div>
</td></tr>
<tr><td style="padding:30px">
 <div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">TILBUD ${number}</div>
 <h1 style="font-size:28px;line-height:1.1;margin:9px 0 14px">${title}</h1>
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Hei ${customerName}. Vi har laget et tilbud til deg fra Aadland Service.</p>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece7df">${rows}</table>
 <div style="margin:22px 0;padding:18px;background:#f7f3ec">
  <div style="font-size:11px;color:#777;text-transform:uppercase;font-weight:800">Total inkl. MVA</div>
  <div style="margin-top:5px;font-size:25px;font-weight:900">${total}</div>
  ${valid?`<div style="margin-top:6px;color:#777;font-size:12px">Gyldig til ${esc(valid)}</div>`:""}
  ${plannedStart?`<div style="margin-top:6px;color:#777;font-size:12px"><b>Tidligst oppstart:</b> ${esc(plannedStart)}</div><div style="margin-top:4px;color:#777;font-size:11px">Endelig oppstart avtales etter godkjenning.</div>`:""}
 </div>
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Åpne tilbudet for full oversikt, betalingsplan og vilkår. Der kan du også godkjenne eller avslå tilbudet.</p>
 <a href="${link}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Åpne tilbud →</a>
 ${hasCustomerAccount?`<a href="${esc(minSideUrl)}" style="display:inline-block;margin-left:8px;border:1px solid #cfa153;color:#8a6326;text-decoration:none;font-weight:900;padding:13px 18px">Min side →</a>`:`<p style="margin:18px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Vil du samle tilbud og oppdrag på ett sted? <a href="${esc(minSideUrl)}" style="color:#8a6326;font-weight:800">Opprett Min side med samme e-postadresse.</a></p>`}
 <p style="margin:26px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Har du spørsmål kan du svare direkte på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">
 Aadland Service · Org.nr. 937 781 873 MVA · post@aadland-service.no
</td></tr>
</table>
</td></tr></table>
</body></html>`;

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const sent=await resend.emails.send({
   from,
   to:email,
   replyTo,
   subject:"Tilbud "+quote.quote_number+" – "+quote.title,
   html
  });
  if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
 }catch(err){
  console.error("QUOTE EMAIL ERROR",err);
  return NextResponse.json({error:"Tilbudet kunne ikke sendes på e-post."},{status:500});
 }

 const now=new Date().toISOString();
 let statusUpdate=await s.from("quotes").update({
  status:"sent",
  sent_at:now,
  follow_up_sent_at:null,
  updated_at:now
 }).eq("id",id);
 if(statusUpdate.error&&String(statusUpdate.error.code||"")==="42703"){
  statusUpdate=await s.from("quotes").update({
   status:"sent",
   sent_at:now,
   updated_at:now
  }).eq("id",id);
 }
 if(statusUpdate.error)return NextResponse.json({error:"E-posten ble sendt, men status kunne ikke lagres."},{status:500});

 return NextResponse.json({ok:true,sentTo:email,sentAt:now,link});
}
