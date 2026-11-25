import {sameOriginGuard} from "../../../../lib/requestGuard";
import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db, fromDbProduct } from "../../../../lib/supabase";
import {safeHttpsUrl} from "../../../../lib/safeUrl";
import {buildReceiptEmail} from "../../../../lib/receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";
import {buildOrderConfirmationEmail} from "../../../../lib/orderConfirmationEmail";
import {sendOrderStatusNotice} from "../../../../lib/orderStatusNotice";
import {sendProductOrderProgressNotice} from "../../../../lib/orderProgressNotice";
import {sendManualOrderRefundNotice} from "../../../../lib/orderRefundNotice";
import {serviceEmailFrom,serviceReplyTo} from "../../../../lib/serviceEmailConfig";
import {sendManualOrderConfirmationOnce} from "../../../../lib/manualOrderConfirmationOnce";
import {sendManualProductReceiptOnce} from "../../../../lib/manualProductReceiptOnce";

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
  paymentProvider: o.payment_provider || "",
  paymentReference: o.payment_reference || "",
  paymentPspReference: o.payment_psp_reference || "",
  paymentReservedOre: Number(o.payment_reserved_ore)||0,
  paymentCapturedOre: Number(o.payment_captured_ore)||0,
  paymentAuthorizedAt: o.payment_authorized_at || null,
  paymentCapturedAt: o.payment_captured_at || null,
  paymentCancelledAt: o.payment_cancelled_at || null,
  paymentCaptureGuaranteedUntil: o.payment_capture_guaranteed_until || null,
  paymentRefundedOre: Number(o.payment_refunded_ore)||0,
  paymentRefundedAt: o.payment_refunded_at || null,
  refundLastOre: Number(o.refund_last_ore)||0,
  refundReference: o.refund_reference || "",
  refundNote: o.refund_note || "",
  refundNoticeSentAt: o.refund_notice_sent_at || null,
  receiptSentAt: o.receipt_sent_at || null,
  confirmationSentAt: o.confirmation_sent_at || null,
  confirmedAt: o.confirmed_at || null,
  inProgressAt: o.in_progress_at || null,
  confirmedNoticeSentAt: o.confirmed_notice_sent_at || null,
  inProgressNoticeSentAt: o.in_progress_notice_sent_at || null,
  trackingNumber: o.tracking_number || "",
  trackingUrl: o.tracking_url || "",
  dispatchedAt: o.dispatched_at || null,
  deliveredAt: o.delivered_at || null,
  trackingSentAt: o.tracking_sent_at || null,
  deliveryNoticeSentAt: o.delivery_notice_sent_at || null,
  readyNoticeSentAt: o.ready_notice_sent_at || null,
  cancellationReason: o.cancellation_reason || "",
  cancellationSentAt: o.cancellation_sent_at || null,
  cancelledAt: o.cancelled_at || null,
  stockReleasedAt: o.stock_released_at || null,
  archivedAt: o.archived_at || null,
  archiveReason: o.archive_reason || null,
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
  const manualReceiptByOrder=new Map();
  const confirmationByOrder=new Map();
  let confirmationListError=false;
  if(orderIds.length){
    const {data:queued,error:queueError}=await s.from("service_order_confirmation_outbox").select("order_id,state,claimed_at").in("order_id",orderIds);
    if(queueError)confirmationListError=true;
    else for(const row of queued||[])confirmationByOrder.set(row.order_id,row);
  }

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

  if(orderIds.length){
    const {data:paymentReceipts,error:receiptError}=await s.from("manual_order_payment_receipts")
      .select("order_id,receipt_state,provider_email_id,last_issue,paid_at,sent_at")
      .in("order_id",orderIds);
    if(!receiptError)for(const receipt of paymentReceipts||[])manualReceiptByOrder.set(receipt.order_id,receipt);
    else console.error("MANUAL PRODUCT RECEIPT LIST ERROR",{code:receiptError.code});
  }
  return NextResponse.json({
    orders: await Promise.all(orderRows.map(async order=>{
      const mapped=mapOrder(order);
      if(order.order_type==="order"&&String(order.payment_provider||"").toLowerCase()!=="vipps"){
        mapped.confirmationDeliveryState=order.confirmation_sent_at?"accepted":confirmationListError?"unavailable":confirmationByOrder.get(order.id)?.state||"legacy_review";
      }
      const privateData=await privateImages(s,mapped.customRequest);
      mapped.customRequest=privateData.text;
      mapped.contactImages=privateData.images;
      const manualReceipt=manualReceiptByOrder.get(order.id);
      if(manualReceipt){
        mapped.manualReceiptState=manualReceipt.receipt_state||"";
        mapped.manualReceiptProviderId=manualReceipt.provider_email_id||"";
        mapped.manualReceiptIssue=manualReceipt.last_issue||"";
        mapped.manualReceiptPaidAt=manualReceipt.paid_at||null;
        mapped.manualReceiptSentAt=manualReceipt.sent_at||null;
      }
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

export async function PATCH(req){ const originError=sameOriginGuard(req); if(originError)return originError;
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

  const { id, status, surveyDate, adminNote, trackingNumber, trackingUrl, action, sendSurveyConfirmation, paymentReference, paymentVerified, receiptReviewResult, receiptReviewNote, receiptReviewProviderId, receiptReviewConfirmation, cancellationReason, progressStatus, refundOre, refundReference, refundNote, deliveryWithinRadius, cleanupConfirmation } = await req.json();
  if(adminNote!==undefined&&String(adminNote||"").length>5000)return NextResponse.json({error:"Internt notat kan være maks 5000 tegn."},{status:400});
  if(paymentReference!==undefined&&String(paymentReference||"").length>120)return NextResponse.json({error:"Betalingsreferansen er for lang."},{status:400});
  if(cancellationReason!==undefined&&String(cancellationReason||"").length>1000)return NextResponse.json({error:"Kanselleringsårsaken kan være maks 1000 tegn."},{status:400});
  if(refundReference!==undefined&&String(refundReference||"").length>120)return NextResponse.json({error:"Tilbakebetalingsreferansen kan være maks 120 tegn."},{status:400});
  if(refundNote!==undefined&&String(refundNote||"").length>1000)return NextResponse.json({error:"Merknad om tilbakebetaling kan være maks 1000 tegn."},{status:400});
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

  if(status!==undefined){
    const {data:order,error:findError}=await s.from("orders").select("order_type").eq("id",id).maybeSingle();
    if(findError)return NextResponse.json({error:"Bestillingen kunne ikke hentes."},{status:500});
    if(order?.order_type==="order"){
      return NextResponse.json({error:"Produktordre må oppdateres med de egne ordreknappene, slik at status og kundevarsler håndteres riktig."},{status:409});
    }
  }

  if(action==="set-delivery-radius"){
    if(typeof deliveryWithinRadius!=="boolean")return NextResponse.json({error:"Leveringskontrollen mangler gyldig verdi."},{status:400});
    const {data:order,error:findError}=await s.from("orders").select("id,order_type,status,fulfillment_type").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Leveringskontroll gjelder produktbestillinger."},{status:400});
    if(order.fulfillment_type!=="delivery")return NextResponse.json({error:"Bestillingen er ikke satt opp for lokal levering."},{status:409});
    if(order.status!=="new")return NextResponse.json({error:"Leveringsområdet må avklares før bestillingen bekreftes."},{status:409});
    const now=new Date().toISOString();
    const {error:updateError}=await s.from("orders").update({delivery_within_radius:deliveryWithinRadius,updated_at:now}).eq("id",id);
    if(updateError)return NextResponse.json({error:"Leveringskontrollen kunne ikke lagres."},{status:500});
    return NextResponse.json({ok:true,deliveryWithinRadius});
  }

  if(action==="change-delivery-to-pickup"){
    const {data:order,error:findError}=await s.from("orders").select("id,order_type,status,fulfillment_type").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    if(order.fulfillment_type!=="delivery")return NextResponse.json({error:"Bestillingen er ikke satt opp for lokal levering."},{status:409});
    if(order.status!=="new")return NextResponse.json({error:"Leveringsmåten kan bare endres før bestillingen er bekreftet."},{status:409});
    const now=new Date().toISOString();
    const {error:updateError}=await s.from("orders").update({fulfillment_type:"pickup",delivery_within_radius:false,updated_at:now}).eq("id",id);
    if(updateError)return NextResponse.json({error:"Leveringsmåten kunne ikke endres."},{status:500});
    return NextResponse.json({ok:true,fulfillmentType:"pickup"});
  }

  if(action==="cancel-and-notify"){
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Denne kanselleringsflyten gjelder produktbestillinger."},{status:400});
    if(order.status==="completed")return NextResponse.json({error:"En fullført bestilling kan ikke kanselleres."},{status:409});

    const reason=String(cancellationReason??order.cancellation_reason??"").trim().slice(0,1000);
    const {data:cancelResult,error:cancelError}=await s.rpc("cancel_product_order_once",{
      target_order_id:id,
      customer_reason:reason||null
    });
    if(cancelError){
      console.error("ORDER CANCEL ERROR",cancelError);
      const message=String(cancelError.message||"");
      if(message.includes("ORDER_ALREADY_COMPLETED"))return NextResponse.json({error:"En fullført bestilling kan ikke kanselleres."},{status:409});
      return NextResponse.json({error:"Bestillingen kunne ikke kanselleres."},{status:500});
    }

    const customerEmail=String(order.customer?.email||"").trim().toLowerCase();
    if(!customerEmail)return NextResponse.json({ok:true,status:"cancelled",statusSaved:true,warning:"Bestillingen er kansellert, men kunden mangler e-postadresse.",cancelResult});

    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY):process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"Bestillingen er kansellert og lageret er frigjort, men e-post er ikke konfigurert.",statusSaved:true},{status:503});

    try{
      const {Resend}=await import("../../../../lib/safeResend");
      const resend=new Resend(resendKey);
      const from=serviceEmailFrom();
      const replyTo=serviceReplyTo();
      const requestOrigin=new URL(req.url).origin;
      const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
      const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
      const accountUrl=order.customer_user_id?base+"/min-side":"";
      const paymentRegistered=["paid","partial","authorized"].includes(String(order.payment_status||""));
      const reasonBlock=reason?`<div style="margin-top:18px;padding:16px;background:#101010;border:1px solid #2d2d2d"><div style="color:#8e887f;font-size:11px">ÅRSAK</div><div style="margin-top:6px;color:#fff;line-height:1.6">${esc(reason)}</div></div>`:"";
      const paymentText=paymentRegistered
        ?`<p style="margin:18px 0 0;color:#d9b365;line-height:1.6"><b>Betaling:</b> Det er registrert betaling/reservasjon på bestillingen. Dette betyr ikke at beløpet er automatisk refundert. Vi håndterer eventuell tilbakebetaling separat og tar kontakt ved behov.</p>`
        :"";
      const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:22px 30px;background:#0d0d0d"><img src="https://www.aadland-service.no/aadland-service-logo.webp" alt="Aadland Service" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"/><div style="margin-top:8px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">BESTILLING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">Bestillingen er kansellert</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0">Hei ${esc(order.customer?.name||"kunde")}. Bestillingen er nå registrert som kansellert hos Aadland Service.</p>
${reasonBlock}
${paymentText}
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Har du spørsmål, kan du svare direkte på denne e-posten eller kontakte oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

      const sent=await resend.emails.send({
        from,
        to:customerEmail,
        replyTo,
        subject:"Bestillingen er kansellert – "+order.order_number,
        html
      });
      if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
      const sentAt=new Date().toISOString();
      const {error:stampError}=await s.from("orders").update({cancellation_sent_at:sentAt,updated_at:sentAt}).eq("id",id);
      if(stampError)console.error("ORDER CANCELLATION STAMP ERROR",stampError);
      return NextResponse.json({
        ok:true,
        status:"cancelled",
        sentTo:customerEmail,
        sentAt,
        paymentAttention:paymentRegistered,
        cancelResult
      });
    }catch(error){
      console.error("ORDER CANCELLATION EMAIL ERROR",error);
      return NextResponse.json({error:"Bestillingen er kansellert og lageret er frigjort, men kundevarselet kunne ikke sendes.",statusSaved:true},{status:500});
    }
  }

  if(action==="set-product-progress-and-notify"||action==="resend-product-progress-notice"){
    const nextStatus=String(progressStatus||"");
    if(!["confirmed","in_progress"].includes(nextStatus))return NextResponse.json({error:"Ugyldig ordrestatus."},{status:400});
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Denne statusflyten gjelder produktbestillinger."},{status:400});
    if(["completed","cancelled"].includes(order.status))return NextResponse.json({error:"En fullført eller kansellert bestilling kan ikke endres."},{status:409});

    const resendOnly=action==="resend-product-progress-notice";
    if(!resendOnly){
      if(nextStatus==="confirmed"&&order.status!=="new")return NextResponse.json({error:"Bare nye bestillinger kan bekreftes med denne handlingen."},{status:409});
      if(nextStatus==="confirmed"&&order.fulfillment_type==="delivery"&&order.delivery_within_radius!==true){
        return NextResponse.json({
          error:order.delivery_within_radius===false
            ?"Leveringsadressen er markert utenfor 15 km. Avtal en annen leveringsmåte før ordren bekreftes."
            :"Kontroller først at leveringsadressen er innenfor 15 km."
        },{status:409});
      }
      if(nextStatus==="in_progress"&&order.status!=="confirmed")return NextResponse.json({error:"Bestillingen må være bekreftet før den settes under arbeid."},{status:409});
      const now=new Date().toISOString();
      const patch=nextStatus==="confirmed"
        ?{status:"confirmed",confirmed_at:order.confirmed_at||now,updated_at:now}
        :{status:"in_progress",in_progress_at:order.in_progress_at||now,updated_at:now};
      const {error:updateError}=await s.from("orders").update(patch).eq("id",id);
      if(updateError)return NextResponse.json({error:"Statusen kunne ikke lagres."},{status:500});
      order.status=nextStatus;
      if(nextStatus==="confirmed")order.confirmed_at=patch.confirmed_at;
      if(nextStatus==="in_progress")order.in_progress_at=patch.in_progress_at;
    }else{
      const hasReached=nextStatus==="confirmed"
        ?Boolean(order.confirmed_at||order.confirmed_notice_sent_at)
        :Boolean(order.in_progress_at||order.in_progress_notice_sent_at);
      if(!hasReached)return NextResponse.json({error:"Bestillingen har ikke nådd denne statusen ennå."},{status:409});
    }

    try{
      const notice=await sendProductOrderProgressNotice({
        s,
        order,
        kind:nextStatus,
        requestOrigin:new URL(req.url).origin
      });
      return NextResponse.json({ok:true,status:order.status,...notice});
    }catch(error){
      console.error("ORDER PROGRESS NOTICE ERROR",error);
      const message=String(error?.message||"");
      let customerError=resendOnly?"Kundevarselet kunne ikke sendes.":"Status er lagret, men kundevarselet kunne ikke sendes.";
      if(message==="ORDER_PROGRESS_NOTICE_EMAIL_MISSING")customerError=resendOnly?"Kunden mangler e-postadresse.":"Status er lagret, men kunden mangler e-postadresse.";
      if(message==="ORDER_PROGRESS_NOTICE_EMAIL_NOT_CONFIGURED")customerError=resendOnly?"E-post er ikke konfigurert.":"Status er lagret, men e-post er ikke konfigurert.";
      return NextResponse.json({error:customerError,statusSaved:!resendOnly},{status:500});
    }
  }

  if(action==="hide-test-order"){
    if(currentUser.role!=="owner")return NextResponse.json({error:"Bare eieren kan skjule testbestillinger."},{status:403});
    if(cleanupConfirmation!=="SKJUL TEST")return NextResponse.json({error:"Skriv SKJUL TEST for å bekrefte."},{status:400});
    const {data:order,error:findError}=await s.from("orders")
      .select("id,archived_at,payment_status,payment_captured_ore,payment_refunded_ore")
      .eq("id",id).maybeSingle();
    if(findError||!order)return NextResponse.json({error:"Bestillingen finnes ikke."},{status:404});
    if(order.archived_at)return NextResponse.json({ok:true,alreadyArchived:true});
    if(String(order.payment_status||"")==="authorized")
      return NextResponse.json({error:"Betalingen er fortsatt reservert. Kanseller reservasjonen hos Vipps først."},{status:409});
    // This does not cancel, refund, falsify, delete or alter any payment records.
    const {data:updated,error}=await s.from("orders").update({
      archived_at:new Date().toISOString(),archive_reason:"test",updated_at:new Date().toISOString()
    }).eq("id",id).is("archived_at",null).select("id").maybeSingle();
    if(error)return NextResponse.json({error:"Testordren kunne ikke flyttes til arkivet."},{status:503});
    if(!updated)return NextResponse.json({error:"Ordren er endret i en annen fane. Oppdater siden."},{status:409});
    return NextResponse.json({ok:true,hidden:true,paymentPreserved:true,
      requiresFinancialReview:Number(order.payment_captured_ore||0)>Number(order.payment_refunded_ore||0)});
  }

  if (action === "archive" || action === "restore") {
    if(action==="archive"){
      const {data:order,error:findError}=await s.from("orders")
        .select("id,order_type,status,total_ore,payment_status,payment_captured_ore,payment_refunded_ore")
        .eq("id",id)
        .single();
      if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});

      if(!["completed","cancelled"].includes(String(order.status||""))){
        return NextResponse.json({error:"Bare ferdige eller kansellerte ordre kan arkiveres."},{status:409});
      }

      if(order.order_type==="order"){
        const paymentStatus=String(order.payment_status||"");
        const captured=Math.max(0,Number(order.payment_captured_ore)||0);
        const refunded=Math.max(0,Number(order.payment_refunded_ore)||0);

        if(order.status==="cancelled"){
          const hasAuthorizedPayment=paymentStatus==="authorized";
          const hasOutstandingRefund=captured>refunded;
          const hasLegacyPaidState=["paid","partial"].includes(paymentStatus)&&paymentStatus!=="refunded";
          if(hasAuthorizedPayment||hasOutstandingRefund||hasLegacyPaidState){
            return NextResponse.json({
              error:hasAuthorizedPayment
                ?"Ordren har fortsatt en reservert betaling og kan ikke arkiveres før betalingen er avklart."
                :"Ordren kan ikke arkiveres før registrert betaling er ferdig tilbakebetalt eller avklart.",
              paymentAttention:true,
              capturedOre:captured,
              refundedOre:refunded,
              remainingOre:Math.max(0,captured-refunded)
            },{status:409});
          }
        }

        if(order.status==="completed"&&["pending","unpaid","partial","authorized"].includes(paymentStatus)){
          return NextResponse.json({
            error:paymentStatus==="authorized"
              ?"Ordren er ferdig, men betalingen står fortsatt som reservert. Avklar betalingen før arkivering."
              :"Ordren er ferdig, men betalingen er ikke ferdig registrert. Registrer betalingen før arkivering.",
            paymentAttention:true,
            capturedOre:captured,
            refundedOre:refunded,
            remainingOre:Math.max(0,(Number(order.total_ore)||0)-captured)
          },{status:409});
        }
      }
    }

    const {error:archiveError}=await s.from("orders").update({archived_at:action==="archive"?new Date().toISOString():null,archive_reason:action==="archive"?"avsluttet":null,updated_at:new Date().toISOString()}).eq("id",id);
    if(archiveError)return NextResponse.json({error:"Arkivstatus kunne ikke lagres."},{status:500});
    return NextResponse.json({ok:true});
  }

  if(action==="send-order-confirmation"){
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Ordrebekreftelse gjelder produktbestillinger."},{status:400});
    if(String(order.payment_provider||"").toLowerCase()!=="vipps"){
      if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"E-post sendes bare i produksjon."},{status:403});
      if(order.confirmation_sent_at)return NextResponse.json({error:"Ordrebekreftelsen er allerede registrert. Ingen ny e-post sendt."},{status:409});
      try{
        const result=await sendManualOrderConfirmationOnce({s,id});
        if(result.state==="accepted")return NextResponse.json({ok:true});
        return NextResponse.json({error:result.state==="unavailable"?"E-posttjenesten er utilgjengelig.": "Ingen ny e-post sendt. Kontroller eksisterende sendestatus i Resend før ny utsending."},{status:409});
      }catch{return NextResponse.json({error:"Sendekontrollen er utilgjengelig. Ingen ny utsending startet."},{status:503});}
    }
    const email=String(order.customer?.email||"").trim().toLowerCase();
    if(!email)return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});
    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY):process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"E-post er ikke konfigurert."},{status:503});
    try{
      const {Resend}=await import("../../../../lib/safeResend");
      const resend=new Resend(resendKey);
      const from=serviceEmailFrom();
      const replyTo=serviceReplyTo();
      const requestOrigin=new URL(req.url).origin;
      const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
      const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
      const minSideUrl=base+"/min-side";
      const accountUrl=order.customer_user_id?minSideUrl:"";
      const html=buildOrderConfirmationEmail({
        orderNumber:order.order_number,
        customerName:order.customer?.name||"kunde",
        totalOre:Number(order.total_ore)||0,
        isCustom:false,
        fulfillmentType:order.fulfillment_type||"pickup",
        accountUrl,
        minSideUrl
      });
      const sent=await resend.emails.send({
        from,
        to:email,
        replyTo,
        subject:"Ordrebekreftelse "+order.order_number,
        html
      });
      if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
      const sentAt=new Date().toISOString();
      const {error:stampError}=await s.from("orders").update({confirmation_sent_at:sentAt,updated_at:sentAt}).eq("id",id);
      if(stampError)console.error("ORDER CONFIRMATION RESEND STAMP ERROR",stampError);
      return NextResponse.json({ok:true,sentTo:email,sentAt});
    }catch(error){
      console.error("ORDER CONFIRMATION RESEND ERROR",error);
      return NextResponse.json({error:"Ordrebekreftelsen kunne ikke sendes."},{status:500});
    }
  }

  if(action==="record-manual-refund-and-notify"||action==="resend-manual-refund-notice"){
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type!=="order")return NextResponse.json({error:"Tilbakebetaling gjelder produktbestillinger."},{status:400});
    if(String(order.payment_provider||"").toLowerCase()==="vipps"){
      return NextResponse.json({error:"Vipps-betaling skal refunderes gjennom Vipps-flyten, ikke registreres manuelt."},{status:409});
    }

    const resendOnly=action==="resend-manual-refund-notice";
    let refundResult=null;
    let updatedOrder=order;

    if(!resendOnly){
      const amount=Number(refundOre);
      if(!Number.isInteger(amount)||amount<=0)return NextResponse.json({error:"Tilbakebetalingsbeløpet må være større enn 0."},{status:400});
      const {data,error:refundError}=await s.rpc("record_manual_order_refund",{
        target_order_id:id,
        refund_ore:amount,
        refund_reference_value:String(refundReference||"").trim()||null,
        refund_note_value:String(refundNote||"").trim()||null
      });
      if(refundError){
        console.error("MANUAL ORDER REFUND ERROR",refundError);
        const message=String(refundError.message||"");
        if(message.includes("NO_CAPTURED_PAYMENT"))return NextResponse.json({error:"Det er ikke registrert noen betaling å tilbakebetale."},{status:409});
        if(message.includes("PAYMENT_ALREADY_FULLY_REFUNDED"))return NextResponse.json({error:"Hele den registrerte betalingen er allerede tilbakebetalt."},{status:409});
        if(message.includes("REFUND_EXCEEDS_CAPTURED_PAYMENT"))return NextResponse.json({error:"Tilbakebetalingen kan ikke være større enn gjenstående registrert betaling."},{status:409});
        if(message.includes("VIPPS_REFUND_REQUIRES_PROVIDER_FLOW"))return NextResponse.json({error:"Vipps-betaling skal refunderes gjennom Vipps-flyten."},{status:409});
        return NextResponse.json({error:"Tilbakebetalingen kunne ikke registreres."},{status:500});
      }
      refundResult=data||null;
      const {data:fresh,error:freshError}=await s.from("orders").select("*").eq("id",id).single();
      if(freshError||!fresh)return NextResponse.json({error:"Tilbakebetalingen er registrert, men ordren kunne ikke lastes på nytt.",statusSaved:true},{status:500});
      updatedOrder=fresh;
    }else{
      if((Number(order.refund_last_ore)||0)<=0||(Number(order.payment_refunded_ore)||0)<=0){
        return NextResponse.json({error:"Det finnes ingen manuell tilbakebetaling å sende bekreftelse for."},{status:409});
      }
    }

    try{
      const notice=await sendManualOrderRefundNotice({
        s,
        order:updatedOrder,
        requestOrigin:new URL(req.url).origin
      });
      return NextResponse.json({
        ok:true,
        ...notice,
        refundResult,
        paymentStatus:updatedOrder.payment_status||"paid",
        refundedTotalOre:Number(updatedOrder.payment_refunded_ore)||0
      });
    }catch(error){
      console.error("MANUAL ORDER REFUND NOTICE ERROR",error);
      const message=String(error?.message||"");
      let customerError=resendOnly?"Tilbakebetalingsbekreftelsen kunne ikke sendes.":"Tilbakebetalingen er registrert, men bekreftelsen kunne ikke sendes.";
      if(message==="ORDER_REFUND_NOTICE_EMAIL_MISSING")customerError=resendOnly?"Kunden mangler e-postadresse.":"Tilbakebetalingen er registrert, men kunden mangler e-postadresse.";
      if(message==="ORDER_REFUND_NOTICE_EMAIL_NOT_CONFIGURED")customerError=resendOnly?"E-post er ikke konfigurert.":"Tilbakebetalingen er registrert, men e-post er ikke konfigurert.";
      return NextResponse.json({error:customerError,statusSaved:!resendOnly,refundResult},{status:500});
    }
  }

  if(action==="review-manual-receipt"){
    if(process.env.VERCEL_ENV==="preview")
      return NextResponse.json({error:"Ekte kvitteringshistorikk kan ikke endres i forhåndsvisning."},{status:403});
    if(currentUser.role!=="owner")
      return NextResponse.json({error:"Bare eieren kan avstemme uavklarte kvitteringer."},{status:403});
    const outcome=String(receiptReviewResult||"");
    const phrase=outcome==="sent"?"BEKREFTET I RESEND":outcome==="unsent"?"IKKE SENDT":null;
    if(!phrase||receiptReviewConfirmation!==phrase)
      return NextResponse.json({error:"Kontroller Resend først, og bruk bekreftelsesteksten."},{status:400});
    const note=String(receiptReviewNote||"").trim();
    if(note.length<12||note.length>1200)
      return NextResponse.json({error:"Skriv hva du faktisk kontrollerte, minst 12 tegn."},{status:400});
    const emailId=String(receiptReviewProviderId||"").trim();
    if(outcome==="sent"&&(emailId.length<8||emailId.length>240))
      return NextResponse.json({error:"Oppgi faktisk Resend-meldings-ID fra leverandørloggen."},{status:400});
    const review=await s.rpc("review_manual_product_receipt",{
      p_order_id:id,p_reviewer_id:currentUser.id,p_result:outcome,
      p_note:note,p_provider_email_id:outcome==="sent"?emailId:null
    });
    if(review.error||!review.data?.ok){
      const still=String(review.error?.message||"").includes("S26_RECEIPT_MAY_STILL_BE_SENDING");
      return NextResponse.json({error:still?
        "Kvitteringen kan fortsatt være under sending. Kontroller Resend på nytt etter fem minutter.":
        "Denne kvitteringen kan ikke avstemmes nå. Oppdater ordren og kontroller Resend-status."},{status:409});
    }
    return NextResponse.json({ok:true,receiptState:review.data.state,
      message:"Sendestatus er journalført etter eierkontroll. Ingen ny e-post og ingen ny betaling er registrert."});
  }

  if(action==="record-paid-and-send-receipt"||action==="send-queued-manual-receipt"){
    if(process.env.VERCEL_ENV==="preview")
      return NextResponse.json({error:"Ekte betalingsregistrering og kvitteringer er sperret i forhåndsvisningen."},{status:403});
    const registering=action==="record-paid-and-send-receipt";
    if(registering){
      const reference=String(paymentReference||"").trim();
      if(reference.length<3||reference.length>120)
        return NextResponse.json({error:"Skriv en betalingsreferanse eller dokumentert betalingsmåte, minst 3 tegn."},{status:400});
      if(paymentVerified!==true)
        return NextResponse.json({error:"Bekreft at betalingen faktisk er kontrollert og mottatt før registrering."},{status:400});
      const result=await s.rpc("record_manual_product_payment_once",{
        p_order_id:id,p_reference:reference,p_actor_id:currentUser.id,
        p_payment_verified:true
      });
      if(result.error){
        const issue=String(result.error.message||"");
        if(issue.includes("S26_ORDER_NOT_FOUND"))
          return NextResponse.json({error:"Bestillingen finnes ikke."},{status:404});
        if(issue.includes("S26_REFERENCE_CONFLICT"))
          return NextResponse.json({error:"Betalingen er allerede registrert med en annen referanse. Kontroller betalingshistorikken før du endrer noe."},{status:409});
        if(issue.includes("S26_PAYMENT_ALREADY_RECORDED_OR_INELIGIBLE"))
          return NextResponse.json({error:"Denne ordren har allerede registrert betaling, gjelder Vipps eller er kansellert/arkivert. Ingen ny betaling eller kvittering er opprettet."},{status:409});
        if(issue.includes("S26_INVALID_ORDER_AMOUNT")||issue.includes("S26_CUSTOMER_EMAIL_REQUIRED"))
          return NextResponse.json({error:"Kontroller ordrebeløp og kundens e-postadresse før betalingen registreres."},{status:409});
        console.error("MANUAL PAYMENT ONCE RECORD FAILED",{orderId:id,code:result.error.code});
        return NextResponse.json({error:"Betalingen kunne ikke registreres trygt."},{status:503});
      }
    }

    // The journal exists only for a real, individually verified first
    // payment. A previously-paid legacy order without this row must NEVER
    // get a synthetic paid event or automatic duplicate receipt.
    const {data:receipt,error:receiptError}=await s.from("manual_order_payment_receipts")
      .select("id,order_id,amount_ore,payment_reference,paid_at,recipient_email,receipt_state,provider_email_id,sent_at")
      .eq("order_id",id).maybeSingle();
    if(receiptError)return NextResponse.json({error:"Betalingen er registrert, men kvitteringshistorikken kunne ikke leses. Kontroller ordren før du prøver igjen.",statusSaved:true},{status:503});
    if(!receipt)return NextResponse.json({error:"Ingen kvitteringsjournal for denne betalingen. Historiske betalinger må kontrolleres manuelt, uten automatisk ny kvittering."},{status:409});
    if(receipt.receipt_state==="sent"||receipt.receipt_state==="reviewed_sent")
      return NextResponse.json({ok:true,alreadyRecorded:true,receiptAlreadySent:true,
        paymentStatus:"paid",paymentReference:receipt.payment_reference,
        message:"Betalingen er allerede registrert. Ingen ny kvittering er sendt."});
    if(receipt.receipt_state!=="queued")
      return NextResponse.json({error:"Betalingen er registrert, men kvitteringsstatusen må kontrolleres i Resend. Ingen ny e-post er sendt.",
        statusSaved:true,receiptNeedsReview:true,receiptState:receipt.receipt_state},{status:409});

    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Ordren kunne ikke hentes. Betalingen er registrert.",statusSaved:true},{status:503});
    if(order.order_type!=="order"||order.payment_status!=="paid"||
       Number(order.payment_captured_ore)!==Number(receipt.amount_ore)||
       Number(order.payment_refunded_ore||0)!==0)
      return NextResponse.json({error:"Betalingsopplysningene er endret. Ingen kvittering er sendt.",statusSaved:true},{status:409});

    const outcome=await sendManualProductReceiptOnce(s,order,receipt,{requestUrl:req.url});
    return NextResponse.json(outcome.payload,{status:outcome.status});
  }

  if(action==="mark-ready-and-notify"){
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type==="custom")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    if(!["pickup","delivery"].includes(order.fulfillment_type))return NextResponse.json({error:"Klar-varsel gjelder bestillinger som skal hentes eller leveres."},{status:400});
    if(!["in_progress","ready"].includes(order.status))return NextResponse.json({error:"Bestillingen må være under arbeid før den kan settes klar."},{status:409});
    const customerEmail=String(order.customer?.email||"").trim().toLowerCase();
    if(!customerEmail)return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});

    const now=new Date().toISOString();
    const {error:updateError}=await s.from("orders").update({status:"ready",updated_at:now}).eq("id",id);
    if(updateError)return NextResponse.json({error:"Bestillingen kunne ikke settes som klar."},{status:500});

    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY):process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"Bestillingen er satt som klar, men e-post er ikke konfigurert.",statusSaved:true},{status:503});

    try{
      const {Resend}=await import("../../../../lib/safeResend");
      const resend=new Resend(resendKey);
      const from=serviceEmailFrom();
      const replyTo=serviceReplyTo();
      const requestOrigin=new URL(req.url).origin;
      const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
      const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
      const accountUrl=order.customer_user_id?base+"/min-side":"";
      const pickup=order.fulfillment_type==="pickup";
      const title=pickup?"Bestillingen din er klar for henting":"Bestillingen din er klar for levering";
      const intro=pickup
       ?"Bestillingen din er ferdig og klar for henting. Ta gjerne kontakt dersom du vil avtale nærmere tidspunkt."
       :"Bestillingen din er ferdig og klar for levering. Vi tar kontakt for å avtale leveringstidspunkt dersom det ikke allerede er avtalt.";
      const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:22px 30px;background:#0d0d0d"><img src="https://www.aadland-service.no/aadland-service-logo.webp" alt="Aadland Service" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"/><div style="margin-top:8px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">BESTILLING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(order.order_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${esc(title)}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(order.customer?.name||"kunde")}! ${esc(intro)}</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">STATUS</div>
<div style="margin-top:5px;color:#fff;font-size:18px;font-weight:900">${pickup?"Klar for henting":"Klar for levering"}</div>
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Spørsmål? Svar på denne e-posten eller kontakt oss på 471 54 898.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
      const sent=await resend.emails.send({
        from,
        to:customerEmail,
        replyTo,
        subject:(pickup?"Klar for henting – ":"Klar for levering – ")+order.order_number,
        html
      });
      if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
      const sentAt=new Date().toISOString();
      const {error:stampError}=await s.from("orders").update({ready_notice_sent_at:sentAt,updated_at:sentAt}).eq("id",id);
      if(stampError)console.error("ORDER READY NOTICE STAMP ERROR",stampError);
      return NextResponse.json({ok:true,status:"ready",sentTo:customerEmail,sentAt});
    }catch(error){
      console.error("ORDER READY NOTICE EMAIL ERROR",error);
      return NextResponse.json({error:"Bestillingen er satt som klar, men kundevarselet kunne ikke sendes.",statusSaved:true},{status:500});
    }
  }

  if(action==="resend-dispatched-notice"||action==="resend-delivered-notice"){
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type==="custom")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    const kind=action==="resend-dispatched-notice"?"dispatched":"delivered";
    if(kind==="dispatched"){
      if(order.fulfillment_type!=="shipping")return NextResponse.json({error:"Sendt-varsel gjelder bare bestillinger som sendes."},{status:400});
      if(!order.dispatched_at)return NextResponse.json({error:"Bestillingen er ikke registrert som sendt ennå."},{status:409});
    }else{
      if(order.fulfillment_type==="shipping")return NextResponse.json({error:"Levert-varsel gjelder bestillinger som hentes eller leveres lokalt."},{status:400});
      if(!order.delivered_at)return NextResponse.json({error:"Bestillingen er ikke registrert som levert ennå."},{status:409});
    }
    try{
      const notice=await sendOrderStatusNotice({
        s,
        order,
        kind,
        requestOrigin:new URL(req.url).origin
      });
      return NextResponse.json({ok:true,...notice});
    }catch(error){
      console.error("ORDER STATUS NOTICE RESEND ERROR",error);
      const message=String(error?.message||"");
      if(message==="ORDER_STATUS_NOTICE_EMAIL_MISSING")return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});
      if(message==="ORDER_STATUS_NOTICE_TRACKING_MISSING")return NextResponse.json({error:"Legg inn sporingsnummer eller sporingslenke før sendt-varselet sendes."},{status:400});
      if(message==="ORDER_STATUS_NOTICE_EMAIL_NOT_CONFIGURED")return NextResponse.json({error:"E-post er ikke konfigurert."},{status:503});
      return NextResponse.json({error:"Kundevarselet kunne ikke sendes."},{status:500});
    }
  }

  if (action === "mark-dispatched" || action === "mark-delivered") {
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type==="custom")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    if(action==="mark-dispatched"&&order.fulfillment_type!=="shipping")return NextResponse.json({error:"Bare bestillinger som sendes kan markeres som sendt."},{status:400});
    if(action==="mark-delivered"&&order.fulfillment_type==="shipping")return NextResponse.json({error:"Bruk Sendt til kunde for bestillinger som sendes."},{status:400});
    if(action==="mark-dispatched"&&order.status!=="in_progress")return NextResponse.json({error:"Bestillingen må være under arbeid før den kan markeres som sendt."},{status:409});
    if(action==="mark-delivered"&&order.status!=="ready")return NextResponse.json({error:"Bestillingen må være klar før den kan markeres som levert."},{status:409});
    if(action==="mark-dispatched"&&!String(order.tracking_number||"").trim()&&!safeHttpsUrl(order.tracking_url))return NextResponse.json({error:"Legg inn sporingsnummer eller sporingslenke før bestillingen markeres som sendt."},{status:400});
    const now=new Date().toISOString();
    const patch=action==="mark-dispatched"
      ?{status:"completed",dispatched_at:order.dispatched_at||now,updated_at:now}
      :{status:"completed",delivered_at:order.delivered_at||now,updated_at:now};
    const {error:updateError}=await s.from("orders").update(patch).eq("id",id);
    if(updateError)return NextResponse.json({error:"Handlingen kunne ikke lagres."},{status:500});

    const updatedOrder={...order,...patch};
    try{
      const notice=await sendOrderStatusNotice({
        s,
        order:updatedOrder,
        kind:action==="mark-dispatched"?"dispatched":"delivered",
        requestOrigin:new URL(req.url).origin
      });
      return NextResponse.json({
        ok:true,
        ...notice,
        paymentCaptureRequired:order.payment_status==="authorized",
        paymentStatus:order.payment_status||"unpaid"
      });
    }catch(error){
      console.error("ORDER STATUS NOTICE ERROR",error);
      const message=String(error?.message||"");
      let customerError="Status er lagret, men kundevarselet kunne ikke sendes.";
      if(message==="ORDER_STATUS_NOTICE_EMAIL_MISSING")customerError="Status er lagret, men kunden mangler e-postadresse.";
      if(message==="ORDER_STATUS_NOTICE_EMAIL_NOT_CONFIGURED")customerError="Status er lagret, men e-post er ikke konfigurert.";
      return NextResponse.json({
        error:customerError,
        statusSaved:true,
        paymentCaptureRequired:order.payment_status==="authorized",
        paymentStatus:order.payment_status||"unpaid"
      },{status:500});
    }
  }

  let surveyOrder=null;
  let surveyDateChanged=false;
  let normalizedSurveyDate=surveyDate===undefined?undefined:"";
  if(surveyDate){
    const value=String(surveyDate).trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)){
      return NextResponse.json({error:"Befaringstidspunktet må sendes som en gyldig tidssonefast verdi."},{status:400});
    }
    const parsedSurveyDate=new Date(value);
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
    const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY):process.env.RESEND_API_KEY;
    if(!resendKey)return NextResponse.json({error:"Befaringen er lagret, men e-post er ikke konfigurert."},{status:503});
    try{
      const {Resend}=await import("../../../../lib/safeResend");
      const resend=new Resend(resendKey);
      const from=serviceEmailFrom();
      const replyTo=serviceReplyTo();
      const customerEmail=String(surveyOrder.customer?.email||"").trim().toLowerCase();
      const customerName=String(surveyOrder.customer?.name||"kunde").trim();
      const surveyText=new Date(normalizedSurveyDate).toLocaleString("nb-NO",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"});
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
