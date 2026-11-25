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
 if(quote.status==="draft"){
  // A draft used for direct invoicing must never accidentally be sent as a
  // standard quote for acceptance. A linked invoice also freezes the source.
  const {data:linked,error:linkedError}=await s.from("invoice_drafts").select("id")
   .eq("source_quote_id",quote.id).eq("installment_index",0).maybeSingle();
  if(linkedError)return NextResponse.json({error:"Faktureringsstatus kunne ikke kontrolleres."},{status:500});
  if(linked)return NextResponse.json({error:"Det er opprettet faktura fra dette tilbudet. Åpne fakturaen i stedet."},{status:409});
  const {data:internal,error:internalError}=await s.from("quote_internal_costs").select("line_costs").eq("quote_id",quote.id).maybeSingle();
  if(internalError)return NextResponse.json({error:"Tilbudsvalgene kunne ikke kontrolleres."},{status:500});
  if(internal?.line_costs?.__directInvoice===true&&internal?.line_costs?.__skipQuoteApproval===true){
   return NextResponse.json({error:"Direkte fakturering er valgt. Bruk Fakturer nederst i tilbudet, ikke Send tilbud."},{status:409});
  }
 }


 // A finalized revision is never re-sent through the first-send endpoint.
 // Create a revision or use the separate, controlled manual delivery process.
 if(quote.status!=="draft"||quote.sent_at||quote.paper_issued_at)
  return NextResponse.json({error:"Tilbudet er allerede sendt eller utlevert. Denne versjonen kan ikke sendes flere ganger. Opprett en revisjon ved endringer."},{status:409});
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
 const deliveryType=overrideEmail&&overrideEmail!==customerEmail?"alternate":"primary";
 if(!email)return NextResponse.json({error:"Kunden må ha e-postadresse før tilbudet kan sendes."},{status:400});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"E-postadressen er ugyldig."},{status:400});
 // Preview must not send to stored customer addresses even if a live API key is present.
 if(process.env.VERCEL_ENV==="preview")
  return NextResponse.json({error:"Ekte tilbudsutsending er sperret i forhåndsvisning. Test bare med simulator."},{status:403});
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
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Hei ${customerName}! Takk for henvendelsen og for at du vurderer Aadland Service. Vi har utarbeidet et tilbud på ${title}, og håper det svarer til dine ønsker.</p>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece7df">${rows}</table>
 <div style="margin:22px 0;padding:18px;background:#f7f3ec">
  <div style="font-size:11px;color:#777;text-transform:uppercase;font-weight:800">Total inkl. MVA</div>
  <div style="margin-top:5px;font-size:25px;font-weight:900">${total}</div>
  ${valid?`<div style="margin-top:6px;color:#777;font-size:12px">Gyldig til ${esc(valid)}</div>`:""}
  ${plannedStart?`<div style="margin-top:6px;color:#777;font-size:12px"><b>Tidligst oppstart:</b> ${esc(plannedStart)}</div><div style="margin-top:4px;color:#777;font-size:11px">Endelig oppstart avtales etter godkjenning.</div>`:""}
 </div>
 <p style="margin:0 0 20px;color:#625d55;line-height:1.65">Du finner hele tilbudet som PDF-vedlegg, med beskrivelse, priser, betalingsplan, betingelser og eventuelle forbehold. Bruk lenken nedenfor for å gjennomgå tilbudet og godkjenne eller avslå det digitalt. Ta gjerne kontakt før du bestemmer deg dersom du har spørsmål eller ønsker endringer.</p>
 <a href="${link}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Se og godkjenn tilbud →</a>
 ${hasCustomerAccount?`<a href="${esc(minSideUrl)}" style="display:inline-block;margin-left:8px;border:1px solid #cfa153;color:#8a6326;text-decoration:none;font-weight:900;padding:13px 18px">Min side →</a>`:`<p style="margin:18px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Vil du samle tilbud og oppdrag på ett sted? <a href="${esc(minSideUrl)}" style="color:#8a6326;font-weight:800">Opprett Min side med samme e-postadresse.</a></p>`}
 <p style="margin:26px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Vi ser frem til muligheten til å hjelpe deg med prosjektet!<br/><br/>Med vennlig hilsen<br/><b>Aadland Service</b><br/>Telefon: 471 54 898<br/>E-post: post@aadland-service.no</p>
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


 // Claim the specific revision/recipient atomically BEFORE touching Resend.
 // A timeout always remains blocked for manual verification, even after the
 // provider's 24-hour idempotency-key cache expires.
 const {data:claim,error:claimError}=await s.rpc("claim_quote_email_send",{
  p_quote_id:id,p_expected_updated_at:quote.updated_at,
  p_recipient:email,p_delivery_type:deliveryType
 });
 if(claimError){
  const detail=String(claimError.message||"");
  if(/quote_dispatch_already_claimed|quote_changed_refresh|quote_already_issued/.test(detail))
   return NextResponse.json({
    error:detail.includes("quote_changed")?"Tilbudet er endret. Last det inn på nytt før du sender.":
     "En sending av denne tilbudsversjonen er allerede startet eller må kontrolleres. Se leveringsstatus i Resend og tilbudshistorikken. Det sendes ingen ny e-post automatisk.",
    reviewRequired:true
   },{status:409});
  console.error("QUOTE DISPATCH CLAIM",{quoteId:id,code:claimError.code});
  return NextResponse.json({error:"Utsendingen kunne ikke låses i databasen. Ingen ny e-post er sendt."},{status:503});
 }
 const idempotencyKey=String(claim?.idempotencyKey||"");
 if(!idempotencyKey)return NextResponse.json({error:"Kunne ikke kontrollere unik utsending. Ingen e-post er sendt."},{status:503});
 let sentAt="";
 const actualRecipient=claim?.state==="provider_accepted"?String(claim.recipient||email):email;
 const actualDeliveryType=claim?.state==="provider_accepted"?String(claim.deliveryType||deliveryType):deliveryType;
 if(claim?.state==="provider_accepted"){
  // Safe recovery of a provider-accepted mail after a database error.
  // This path NEVER contacts Resend and does not transmit another email.
  const {data:recovered,error:finishError}=await s.rpc("complete_quote_email_send",{
   p_quote_id:id,p_idempotency_key:idempotencyKey
  });
  if(finishError){
   console.error("QUOTE DISPATCH RECOVER",{quoteId:id,code:finishError.code});
   return NextResponse.json({error:"E-posten er bekreftet mottatt hos leverandøren, men tilbudsstatus kan ikke ferdigstilles. Ingen ny e-post er sendt.",reviewRequired:true},{status:503});
  }
  sentAt=recovered?.sentAt;
 }else if(claim?.state==="claimed"){
  let providerEmailId="";
  try{
   const {Resend}=await import("../../../../../lib/safeResend");
   const resend=new Resend(resendKey);
   const sent=await resend.emails.send({
    from,
    to:email,
    replyTo,
    subject:(revisionNumber>1?"Revidert tilbud ":"Tilbud ")+quote.quote_number+" – "+quote.title,
    html,
    attachments:[{filename,content:pdf.toString("base64")}]
   },{idempotencyKey});
   if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
   providerEmailId=String(sent?.data?.id||"").trim();
   if(!providerEmailId)throw new Error("Resend mangler en bekreftet meldings-ID.");
  }catch(err){
   console.error("QUOTE EMAIL UNCERTAIN",{quoteId:id,message:err?.message});
   const flag=await s.rpc("quote_email_send_uncertain",{
    p_quote_id:id,p_idempotency_key:idempotencyKey,p_reason:err?.message||"Uavklart Resend-status"
   });
   if(flag.error)console.error("QUOTE EMAIL UNCERTAIN SAVE",{quoteId:id,code:flag.error.code});
   return NextResponse.json({
    error:"E-poststatus er ikke bekreftet. Utsendingen er sperret mot dobbelsending. Kontroller hos Resend før du prøver på nytt.",
    reviewRequired:true
   },{status:409});
  }
  const acknowledged=await s.rpc("quote_email_provider_accepted",{
   p_quote_id:id,p_idempotency_key:idempotencyKey,p_provider_email_id:providerEmailId
  });
  if(acknowledged.error){
   console.error("QUOTE PROVIDER ACK SAVE",{quoteId:id,code:acknowledged.error.code,providerEmailId});
   return NextResponse.json({error:"E-posten er bekreftet hos leverandøren, men kvitteringen kunne ikke lagres. Ikke send på nytt.",reviewRequired:true},{status:503});
  }
  const {data:completed,error:completionError}=await s.rpc("complete_quote_email_send",{
   p_quote_id:id,p_idempotency_key:idempotencyKey
  });
  if(completionError){
   console.error("QUOTE SEND FINALIZE",{quoteId:id,code:completionError.code,providerEmailId});
   return NextResponse.json({error:"E-posten ble sendt, men tilbudet kunne ikke ferdigstilles. Åpne tilbudet på nytt; ingen ny e-post må sendes.",reviewRequired:true},{status:503});
  }
  sentAt=completed?.sentAt;
 }else{
  return NextResponse.json({error:"Ukjent sendestatus. Ikke send tilbudet på nytt.",reviewRequired:true},{status:503});
 }
 if(!sentAt)return NextResponse.json({error:"Tilbudsutsendingen må kontrolleres før videre behandling.",reviewRequired:true},{status:503});
 const now=sentAt;

 // Never publish an attachment to a customer when this email was an admin test
 // or was delivered to any address other than the customer's own.
 let drawingsPublished=drawings.length===0;
 if(drawings.length&&actualDeliveryType==="primary"&&customerEmail){
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

 // History is committed atomically in complete_quote_email_send; never insert a duplicate log here.

 return NextResponse.json({ok:true,sentTo:actualRecipient,sentAt:now,deliveryType:actualDeliveryType,link,pdfAttached:true,pdfFilename:filename,drawingsPublished});
}


const QUOTE_ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Read-only send audit for the quote editor. The provider ID is not a customer secret.
export async function GET(req){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=String(new URL(req.url).searchParams.get("id")||"");
 if(!QUOTE_ID_PATTERN.test(id))return NextResponse.json({error:"Ugyldig tilbuds-ID."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const [q,a]=await Promise.all([
  s.from("quotes").select("id,quote_number,status").eq("id",id).maybeSingle(),
  s.from("quote_email_send_attempts")
   .select("recipient,state,provider_email_id,claimed_at,provider_accepted_at,sent_at,updated_at,reviewed_at")
   .eq("quote_id",id).maybeSingle()
 ]);
 if(q.error||a.error)return NextResponse.json({error:"Kunne ikke hente utsendingsstatus."},{status:503});
 if(!q.data)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 return NextResponse.json({quoteNumber:q.data.quote_number,quoteStatus:q.data.status,
  canRelease:user.role==="owner",attempt:a.data||null},{headers:{"Cache-Control":"no-store"}});
}

// Manual recovery is separate from sending. It NEVER contacts the email provider.
export async function PATCH(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=String(body.id||"");
 if(!QUOTE_ID_PATTERN.test(id))return NextResponse.json({error:"Ugyldig tilbuds-ID."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 if(body.action==="finalize"){
  const found=await s.from("quote_email_send_attempts")
   .select("state,idempotency_key").eq("quote_id",id).maybeSingle();
  if(found.error||found.data?.state!=="provider_accepted")
   return NextResponse.json({error:"Ingen leverandørbekreftet e-post kan ferdigstilles."},{status:409});
  const result=await s.rpc("complete_quote_email_send",{
   p_quote_id:id,p_idempotency_key:found.data.idempotency_key
  });
  if(result.error)return NextResponse.json({error:"Ferdigstilling feilet. Ingen ny e-post er sendt."},{status:503});
  return NextResponse.json({ok:true,state:"sent",sentAt:result.data?.sentAt});
 }
 if(body.action==="confirmProvider"){
  if(user.role!=="owner"||body.confirmation!=="BEKREFTET I RESEND")
   return NextResponse.json({error:"Bare eier kan bekrefte sending, etter kontroll i Resend."},{status:403});
  const result=await s.rpc("confirm_quote_provider_after_review",{
   p_quote_id:id,p_quote_number:String(body.quoteNumber||""),p_reviewer:user.id,
   p_confirmed_sent:true,p_provider_email_id:String(body.providerEmailId||"").trim(),
   p_note:String(body.note||"").trim()
  });
  if(result.error){
   const msg=String(result.error.message||"");
   return NextResponse.json({error:msg.includes("quote_attempt_too_recent")?
    "Sendeprosessen kan fortsatt være aktiv. Kontroller på nytt etter minst fem minutter.":
    "Kunne ikke bekrefte Resend-kvitteringen. Kontroller ID, tilbudsnummer og begrunnelse."},{status:409});
  }
  return NextResponse.json({ok:true,state:"provider_accepted"});
 }
 if(body.action!=="release"||user.role!=="owner")
  return NextResponse.json({error:"Bare eier kan frigjøre en uavklart sending."},{status:403});
 if(body.confirmation!=="IKKE SENDT")
  return NextResponse.json({error:"Kontroller først hos Resend, og bekreft med IKKE SENDT."},{status:400});
 const result=await s.rpc("release_quote_email_after_review",{
  p_quote_id:id,p_quote_number:String(body.quoteNumber||""),
  p_reviewer:user.id,p_confirmed_not_sent:true,p_note:String(body.note||"")
 });
 if(result.error){
  const msg=String(result.error.message||"");
  return NextResponse.json({error:msg.includes("quote_attempt_too_recent")?
   "Sendeprosessen kan fortsatt være aktiv. Kontroller på nytt etter minst fem minutter.":
   "Kunne ikke frigjøre sendingen. Kontroller at tilbudsnummer, leveringsstatus og begrunnelse stemmer."},{status:409});
 }
 return NextResponse.json({ok:true,state:"released"});
}
