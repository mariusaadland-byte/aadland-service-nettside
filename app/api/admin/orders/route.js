import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db } from "../../../../lib/supabase";
import {safeHttpsUrl} from "../../../../lib/safeUrl";

function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}

async function privateImages(s,value){if(typeof value!=="string")return {text:value,images:[]};const matches=[...value.matchAll(/private-image:([a-z0-9_-]+):([^\\s]+)/gi)];let text=value;const images=[];for(const match of matches){const bucket=match[1],path=match[2];if(bucket!=="contact-images"||!path.startsWith("contact/")||path.includes("..")||path.startsWith("/"))continue;const {data,error}=await s.storage.from("contact-images").createSignedUrl(path,3600);if(!error&&data?.signedUrl){images.push({ref:match[0],url:data.signedUrl});text=text.replace(match[0],"[Vedlagt bilde]")}}return {text,images}}

const mapOrder = (o) => ({
  id: o.id,
  orderNumber: o.order_number,
  orderType: o.order_type,
  status: o.status,
  customerName: o.customer?.name || "",
  customerEmail: o.customer?.email || "",
  customerPhone: o.customer?.phone || "",
  customer: o.customer,
  fulfillmentType: o.fulfillment_type,
  deliveryWithinRadius: o.delivery_within_radius,
  items: o.items || [],
  customRequest: o.custom_request,
  totalOre: o.total_ore,
  createdAt: o.created_at,
  surveyDate: o.survey_date || null,
  surveyConfirmationSentAt: o.survey_confirmation_sent_at || null,
  surveyReminderSentAt: o.survey_reminder_sent_at || null,
  adminNote: o.admin_note || "",
  jobStartAt: o.job_start_at || null,
  jobCustomerAgreement: o.job_customer_agreement || "",
  jobPlanningUpdatedAt: o.job_planning_updated_at || null,
  jobConfirmationSentAt: o.job_confirmation_sent_at || null,
  paymentStatus: o.payment_status || "unpaid",
  paymentReference: o.payment_reference || "",
  trackingNumber: o.tracking_number || "",
  trackingUrl: o.tracking_url || "",
  dispatchedAt: o.dispatched_at || null,
  deliveredAt: o.delivered_at || null,
  archivedAt: o.archived_at || null,
});

export async function GET() {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canViewOrders"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å se bestillinger." },
      { status: 403 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { data, error } = await s
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ADMIN ORDERS GET ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      { error: "Bestillingene kunne ikke hentes." },
      { status: 500 }
    );
  }

  const orderRows=data||[];
  const orderIds=orderRows.map(order=>order.id);
  const quoteByOrder=new Map();

  if(orderIds.length){
    const {data:linkedQuotes,error:quoteError}=await s
      .from("quotes")
      .select("id,quote_number,title,status,total_inc_vat_ore,payment_plan,accepted_at,planned_start_date,converted_order_id")
      .in("converted_order_id",orderIds);

    if(!quoteError){
      for(const quote of linkedQuotes||[]){
        if(quote.converted_order_id)quoteByOrder.set(quote.converted_order_id,quote);
      }
    }else if(!["42P01","42703"].includes(String(quoteError.code||""))){
      console.error("ADMIN ORDER QUOTE LINK ERROR",quoteError);
    }
  }

  return NextResponse.json({
    orders: await Promise.all(orderRows.map(async order=>{
      const mapped=mapOrder(order);
      const privateData=await privateImages(s,mapped.customRequest);
      mapped.customRequest=privateData.text;
      mapped.contactImages=privateData.images;
      const quote=quoteByOrder.get(order.id);
      if(quote){
        mapped.sourceQuoteId=quote.id;
        mapped.sourceQuoteNumber=quote.quote_number;
        mapped.sourceQuoteTitle=quote.title||"";
        mapped.sourceQuoteStatus=quote.status||"accepted";
        mapped.sourceQuoteAcceptedAt=quote.accepted_at||null;
        mapped.sourceQuotePlannedStartDate=quote.planned_start_date||null;
        mapped.sourceQuoteTotalOre=Number(quote.total_inc_vat_ore)||0;
        mapped.sourceQuotePaymentPlan=Array.isArray(quote.payment_plan)?quote.payment_plan:[];
      }
      return mapped;
    })),
  });
}

export async function PATCH(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canUpdateOrders"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å endre bestillinger." },
      { status: 403 }
    );
  }

  const { id, status, surveyDate, adminNote, trackingNumber, trackingUrl, action, sendSurveyConfirmation } = await req.json();
  if(adminNote!==undefined&&String(adminNote||"").length>5000)return NextResponse.json({error:"Internt notat kan være maks 5000 tegn."},{status:400});
  if(trackingNumber!==undefined&&String(trackingNumber||"").length>120)return NextResponse.json({error:"Sporingsnummeret er for langt."},{status:400});
  if(trackingUrl!==undefined){const value=String(trackingUrl||"").trim();if(value.length>1000)return NextResponse.json({error:"Sporingslenken er for lang."},{status:400});if(value&&!safeHttpsUrl(value))return NextResponse.json({error:"Sporingslenken må være en gyldig https-adresse."},{status:400});}

  const allowed = [
    "new",
    "confirmed",
    "in_progress",
    "ready",
    "completed",
    "cancelled",
  ];

  if (!id) {
    return NextResponse.json(
      { error: "Bestilling mangler." },
      { status: 400 }
    );
  }

  if (status !== undefined && !allowed.includes(status)) {
    return NextResponse.json(
      { error: "Ugyldig status." },
      { status: 400 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  if (action === "archive" || action === "restore") {
    const {error:archiveError}=await s.from("orders").update({archived_at:action==="archive"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",id);
    if(archiveError)return NextResponse.json({error:"Arkivstatus kunne ikke lagres."},{status:500});
    return NextResponse.json({ok:true});
  }

  if (action === "mark-dispatched" || action === "mark-delivered") {
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type==="custom")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    if(action==="mark-dispatched"&&order.fulfillment_type!=="shipping")return NextResponse.json({error:"Bare bestillinger som sendes kan markeres som sendt."},{status:400});
    if(action==="mark-delivered"&&order.fulfillment_type==="shipping")return NextResponse.json({error:"Bruk Sendt til kunde for bestillinger som sendes."},{status:400});
    const now=new Date().toISOString();if(action==="mark-dispatched"&&!String(order.tracking_number||"").trim()&&!String(order.tracking_url||"").trim())return NextResponse.json({error:"Legg inn sporingsnummer eller sporingslenke før bestillingen markeres som sendt."},{status:400});const patch=action==="mark-dispatched"?{status:"completed",dispatched_at:now}:{status:"completed",delivered_at:now};
    const {error:updateError}=await s.from("orders").update(patch).eq("id",id);
    if(updateError)return NextResponse.json({error:"Handlingen kunne ikke lagres."},{status:500});
    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY):process.env.RESEND_API_KEY;
    if(resendKey&&order.customer?.email){
      try{
        const {Resend}=await import("resend");
        const resend=new Resend(resendKey);
        const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
        const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
        const sent=action==="mark-dispatched";
        const requestOrigin=new URL(req.url).origin;
        const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
        const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
        const accountUrl=order.customer_user_id?base+"/min-side":"";
        const trackingUrl=sent?safeHttpsUrl(order.tracking_url):"";
        const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BESTILLING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${sent?"Bestillingen din er sendt":"Bestillingen din er levert"}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(order.customer.name||"kunde")}! ${sent?"Bestillingen er nå sendt fra oss.":"Bestillingen er registrert som levert."}</p>
${sent&&order.tracking_number?`<div style="padding:14px;background:#101010;border:1px solid #2d2d2d"><div style="color:#8e887f;font-size:11px">Sporingsnummer</div><div style="margin-top:5px;color:#fff;font-weight:800">${esc(order.tracking_number)}</div></div>`:""}
${trackingUrl?`<a href="${esc(trackingUrl)}" style="display:inline-block;margin-top:18px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Spor pakken →</a>`:""}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:18px;${trackingUrl?"margin-left:8px;":""}border:1px solid #d7a74e;color:#d7a74e;text-decoration:none;font-weight:900;padding:12px 18px">Åpne Min side →</a>`:""}
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
        await resend.emails.send({
          from,
          to:order.customer.email,
          replyTo,
          subject:sent?"Bestillingen din er sendt – "+order.order_number:"Bestillingen din er levert – "+order.order_number,
          html
        });
        await s.from("orders").update(sent?{tracking_sent_at:now}:{delivery_notice_sent_at:now}).eq("id",id);
      }catch(e){console.error("ORDER STATUS EMAIL ERROR",e)}
    }
    return NextResponse.json({ok:true,paymentCaptureRequired:order.payment_status==="authorized",paymentStatus:order.payment_status||"unpaid"});
  }

  let surveyOrder=null;
  let surveyDateChanged=false;
  let normalizedSurveyDate=surveyDate===undefined?undefined:"";
  if(surveyDate){
    const parsedSurveyDate=new Date(surveyDate);
    if(Number.isNaN(parsedSurveyDate.getTime()))return NextResponse.json({error:"Velg gyldig dato og klokkeslett for befaring."},{status:400});
    normalizedSurveyDate=parsedSurveyDate.toISOString();
  }
  if(surveyDate!==undefined||sendSurveyConfirmation===true){
    if(sendSurveyConfirmation===true&&!surveyDate)return NextResponse.json({error:"Velg dato og klokkeslett før bekreftelsen sendes."},{status:400});
    const {data:found,error:findError}=await s.from("orders").select("*").eq("id",id).maybeSingle();
    if(findError||!found)return NextResponse.json({error:"Forespørselen ble ikke funnet."},{status:404});
    if(found.order_type!=="custom")return NextResponse.json({error:"Befaringsbekreftelse gjelder bare forespørsler."},{status:400});
    if(sendSurveyConfirmation===true&&!String(found.customer?.email||"").trim())return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});
    surveyOrder=found;
    const previousSurvey=found.survey_date?new Date(found.survey_date).toISOString():"";
    const nextSurvey=normalizedSurveyDate||"";
    surveyDateChanged=previousSurvey!==nextSurvey;
  }

  const updatePatch={
    ...(status !== undefined ? { status } : {}),
    ...(surveyDate !== undefined ? {
      survey_date:normalizedSurveyDate||null,
      ...(surveyDateChanged?{survey_confirmation_sent_at:null,survey_reminder_sent_at:null}:{})
    } : {}),
    ...(adminNote !== undefined ? { admin_note: adminNote || null } : {}),
    ...(trackingNumber !== undefined ? { tracking_number: String(trackingNumber||"").trim() || null } : {}),
    ...(trackingUrl !== undefined ? { tracking_url: String(trackingUrl||"").trim() || null } : {}),
    ...(sendSurveyConfirmation===true ? {status:"confirmed"} : {})
  };

  const { error } = await s
    .from("orders")
    .update(updatePatch)
    .eq("id", id);

  if (error) {
    console.error("ADMIN ORDER UPDATE ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      { error: "Status kunne ikke lagres." },
      { status: 500 }
    );
  }

  if(sendSurveyConfirmation===true&&surveyOrder){
    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY):process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"Befaringen er lagret, men e-post er ikke konfigurert."},{status:503});
    try{
      const {Resend}=await import("resend");
      const resend=new Resend(resendKey);
      const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
      const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
      const customerEmail=String(surveyOrder.customer?.email||"").trim().toLowerCase();
      const customerName=String(surveyOrder.customer?.name||"kunde").trim();
      const surveyText=new Date(surveyDate).toLocaleString("nb-NO",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"});
      const requestOrigin=new URL(req.url).origin;
      const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
      const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
      const accountUrl=surveyOrder.customer_user_id?base+"/min-side":"";
      const address=[surveyOrder.customer?.address,surveyOrder.customer?.postalCode,surveyOrder.customer?.city].filter(Boolean).join(", ");
      const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">BEFARING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(surveyOrder.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Befaringen er avtalt</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(customerName)}. Her er bekreftelsen på tidspunktet vi har avtalt.</p>
<div style="padding:17px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">DATO OG TID</div><div style="margin-top:5px;color:#fff;font-size:21px;font-weight:900">${esc(surveyText)}</div>
${address?`<div style="margin-top:14px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Hvis tidspunktet ikke lenger passer, kan du svare direkte på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
      const sent=await resend.emails.send({
        from,to:customerEmail,replyTo,
        subject:"Bekreftelse på befaring – Aadland Service",
        html
      });
      if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
      const sentAt=new Date().toISOString();
      const {error:stampError}=await s.from("orders").update({survey_confirmation_sent_at:sentAt,survey_reminder_sent_at:null}).eq("id",id);
      if(stampError&&!["42703"].includes(String(stampError.code||"")))console.error("SURVEY CONFIRMATION STAMP ERROR",stampError);
      return NextResponse.json({ok:true,sentTo:customerEmail,sentAt});
    }catch(e){
      console.error("SURVEY CONFIRMATION EMAIL ERROR",e);
      return NextResponse.json({error:"Befaringen er lagret, men bekreftelsen kunne ikke sendes på e-post."},{status:500});
    }
  }

  return NextResponse.json({ ok: true });
}
