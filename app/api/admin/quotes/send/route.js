import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {createQuoteToken} from "../../../../../lib/quoteLinks";
import {osloDateKey} from "../../../../../lib/osloTime";
import {buildQuotePdf,quotePdfFilename} from "../../../../../lib/quotePdf";
import {loadQuoteDrawings} from "../../../../../lib/quoteDrawingLoader";

export const runtime="nodejs";

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
 const {id,recipientEmail}=await req.json().catch(()=>({}));
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});

 if(["accepted","declined","cancelled","superseded"].includes(quote.status))return NextResponse.json({error:"Dette tilbudet er ferdigbehandlet og kan ikke sendes på nytt."},{status:409});
 if(quote.revised_from_id){
  const {data:previous,error:previousError}=await s.from("quotes")
   .select("status,superseded_by_id")
   .eq("id",quote.revised_from_id)
   .maybeSingle();
  if(previousError||!previous)return NextResponse.json({error:"Forrige tilbudsversjon kunne ikke kontrolleres."},{status:409});
  const alreadyLinked=previous.status==="superseded"&&previous.superseded_by_id===quote.id;
  if(!alreadyLinked&&!["sent","expired"].includes(previous.status)){
   return NextResponse.json({error:"Forrige tilbudsversjon er allerede ferdigbehandlet. Denne revisjonen kan derfor ikke sendes."},{status:409});
  }
 }
 const today=osloDateKey(new Date());
 if(quote.valid_until&&quote.valid_until<today)return NextResponse.json({error:"Tilbudet har passert gyldighetsdatoen. Oppdater datoen før du sender det."},{status:409});
 const customerEmail=String(quote.customer?.email||"").trim().toLowerCase();
 const overrideEmail=String(recipientEmail||"").trim().toLowerCase();
 const email=overrideEmail||customerEmail;
 if(!email)return NextResponse.json({error:"Kunden må ha e-postadresse før tilbudet kan sendes."},{status:400});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"E-postadressen er ugyldig."},{status:400});
 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"E-post er ikke konfigurert på serveren."},{status:503});

 const token=createQuoteToken(quote);
 const requestOrigin=new URL(req.url).origin;
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin||"https://www.aadland-service.no");
 const link=base+"/tilbud/"+encodeURIComponent(quote.id)+"#token="+encodeURIComponent(token);
 const valid=quote.valid_until?new Date(quote.valid_until+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const plannedStart=quote.planned_start_date?new Date(quote.planned_start_date+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const from="Aadland Service <post@aadland-service.no>";
 const replyTo="post@aadland-service.no";
 const customerName=esc(quote.customer?.name||"");
 const title=esc(quote.title||"Tilbud");
 const number=esc(quote.quote_number||"");
 const revisionNumber=Math.max(1,Number(quote.revision_number)||1);
 const revisionLabel=revisionNumber>1?"REVISJON "+revisionNumber:"";
 const total=nok(quote.total_inc_vat_ore);
 const minSideUrl=base+"/min-side";
 let hasCustomerAccount=false;
 try{
  const {data:profile}=await s.from("customer_profiles").select("id").eq("email",(customerEmail||email).toLowerCase()).maybeSingle();
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
 <div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">TILBUD ${number}${revisionLabel?" · "+revisionLabel:""}</div>
 <h1 style="font-size:28px;line-height:1.1;margin:9px 0 14px">${title}</h1>
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Hei ${customerName}. Vi har laget et tilbud til deg fra Aadland Service.</p>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece7df">${rows}</table>
 <div style="margin:22px 0;padding:18px;background:#f7f3ec">
  <div style="font-size:11px;color:#777;text-transform:uppercase;font-weight:800">Total inkl. MVA</div>
  <div style="margin-top:5px;font-size:25px;font-weight:900">${total}</div>
  ${valid?`<div style="margin-top:6px;color:#777;font-size:12px">Gyldig til ${esc(valid)}</div>`:""}
  ${plannedStart?`<div style="margin-top:6px;color:#777;font-size:12px"><b>Tidligst oppstart:</b> ${esc(plannedStart)}</div><div style="margin-top:4px;color:#777;font-size:11px">Endelig oppstart avtales etter godkjenning.</div>`:""}
 </div>
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Du finner en PDF-kopi av hele tilbudet vedlagt denne e-posten. Åpne lenken nedenfor for å se tilbudet på nettsiden og godkjenne eller avslå det.</p>
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

 let pdf;
 let drawings=[];
 const filename=quotePdfFilename(quote);
 try{
  drawings=await loadQuoteDrawings(s,quote);
  pdf=await buildQuotePdf(quote,drawings);
  if(!pdf?.length||pdf.subarray(0,8).toString("ascii")!=="%PDF-1.4"){
   throw new Error("Ugyldig tilbuds-PDF");
  }
 }catch(err){
  console.error("QUOTE PDF GENERATION ERROR",{quoteId:id,message:err?.message});
  return NextResponse.json({error:"PDF-kopien kunne ikke lages: "+String(err?.message||"Ukjent feil").slice(0,180)+". Tilbudet er ikke sendt."},{status:500});
 }

 // Prevent sharing a linked customer's drawing with a different offer recipient.
 if(drawings.length){
  const ids=[...new Set(drawings.map(row=>row.customer_contact_id).filter(Boolean))];
  const owners=new Map();
  if(ids.length){
   const {data:contacts,error:contactError}=await s.from("admin_customer_contacts")
    .select("id,email").in("id",ids);
   if(contactError)return NextResponse.json({error:"Kunne ikke kontrollere eieren av tegningsvedlegget. Tilbudet er ikke sendt."},{status:500});
   for(const row of contacts||[])owners.set(row.id,String(row.email||"").trim().toLowerCase());
  }
  for(const drawing of drawings){
   const storedEmail=String(drawing.drawing_data?.customerEmail||"").trim().toLowerCase();
   const linkedEmail=owners.get(drawing.customer_contact_id)||"";
   const expectedEmail=linkedEmail||storedEmail;
   if(expectedEmail&&expectedEmail!==customerEmail){
    return NextResponse.json({error:"En valgt tegning er knyttet til en annen e-postadresse enn tilbudskunden. Velg riktig kunde og tegning før du sender."},{status:409});
   }
  }
 }

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const sent=await resend.emails.send({
   from,
   to:email,
   replyTo,
   subject:(revisionNumber>1?"Revidert tilbud ":"Tilbud ")+quote.quote_number+" – "+quote.title,
   html,
   attachments:[{filename,content:pdf.toString("base64")}]
  });
  if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
 }catch(err){
  console.error("QUOTE EMAIL ERROR",err);
  return NextResponse.json({error:"Tilbudet kunne ikke sendes på e-post."},{status:500});
 }

 const now=new Date().toISOString();
 const {error:activationError}=await s.rpc("activate_quote_revision",{p_quote_id:id,p_sent_at:now});
 if(activationError){
  console.error("QUOTE REVISION ACTIVATE",activationError);
  return NextResponse.json({error:"E-posten ble sendt, men revisjonsstatus kunne ikke lagres. Kontroller tilbudet før du sender på nytt."},{status:500});
 }

 try{
  await s.from("quotes").update({
   issued_via:quote.issued_via||"email",
   updated_at:now
  }).eq("id",id);
 }catch(issueMethodError){
  console.error("QUOTE EMAIL ISSUE METHOD",issueMethodError);
 }

 const deliveryType=overrideEmail&&overrideEmail!==customerEmail?"alternate":"primary";
 // Never publish an attachment to a customer when this email was an admin test
 // or was delivered to any address other than the customer's own.
 let drawingsPublished=drawings.length===0;
 if(drawings.length&&deliveryType==="primary"&&customerEmail){
  const snapshots=drawings.map(row=>({
   quote_id:quote.id,drawing_id:row.id,customer_email:customerEmail,
   name:row.name||"Tegning",address:row.address||"",
   // Customer-facing copy: keep geometry, not internal admin notes, contact
   // records, project metadata or draft-only information.
   notes:"",
   drawing_data:{
    walls:Array.isArray(row.drawing_data?.walls)?row.drawing_data.walls:[],
    zones:Array.isArray(row.drawing_data?.zones)?row.drawing_data.zones:[],
    items:Array.isArray(row.drawing_data?.items)?row.drawing_data.items:[],
    defaultWallHeight:Number(row.drawing_data?.defaultWallHeight)||2400,
    defaultWallThickness:Number(row.drawing_data?.defaultWallThickness)||98
   },
   published_at:now
  }));
  const {error:publishError}=await s.from("quote_drawing_publications")
   .upsert(snapshots,{onConflict:"quote_id,drawing_id",ignoreDuplicates:true});
  if(publishError)console.error("QUOTE DRAWING PUBLICATION",{quoteId:id,message:publishError.message});
  else drawingsPublished=true;
 }

 try{
  await s.from("quote_send_log").insert({
   quote_id:id,
   recipient:email,
   delivery_type:deliveryType,
   sent_at:now
  });
 }catch(logError){
  console.error("QUOTE SEND LOG",logError);
 }

 return NextResponse.json({ok:true,sentTo:email,sentAt:now,deliveryType,link,pdfAttached:true,pdfFilename:filename,drawingsPublished});
}
