import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {buildReceiptEmail} from "../../../../lib/receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";
import {rentalEmailFrom,rentalReplyTo,rentalSiteUrl} from "../../../../lib/rentalEmailConfig";

async function canView(){
 return Boolean(await getAdminUser())&&Boolean(await hasPermission("canViewOrders"));
}

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function kr(ore){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);
}

function date(value){
 if(!value)return "";
 const d=new Date(value+"T12:00:00");
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("nb-NO",{day:"2-digit",month:"2-digit",year:"numeric"});
}

const map=b=>({
 id:b.id,
 bookingNumber:b.booking_number,
 itemId:b.rental_item_id,
 itemName:b.rental_items?.name||"",
 customer:b.customer||{},
 customerUserId:b.customer_user_id||null,
 startDate:b.start_date,
 endDate:b.end_date,
 status:b.status,
 totalOre:b.total_ore,
 depositOre:b.deposit_ore,
 paymentStatus:b.payment_status||"unpaid",
 paymentReference:b.payment_reference||"",
 paymentCapturedOre:Number(b.payment_captured_ore)||0,
 receiptSentAt:b.receipt_sent_at||null,
 depositStatus:b.deposit_status||"not_paid",
 depositReference:b.deposit_reference||"",
 depositHeldOre:Number(b.deposit_held_ore)||0,
 depositReceivedAt:b.deposit_received_at||null,
 depositReleasedAt:b.deposit_released_at||null,
 depositChargedOre:Number(b.deposit_charged_ore)||0,
 adminNote:b.admin_note||"",
 confirmationSentAt:b.confirmation_sent_at||null,
 cancellationSentAt:b.cancellation_sent_at||null,
 reminderSentAt:b.reminder_sent_at||null,
 createdAt:b.created_at,
 updatedAt:b.updated_at
});

function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return false;
 const d=new Date(value+"T12:00:00Z");
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
}

async function checkAvailability(s,booking){
 const {data:item,error:itemError}=await s.from("rental_items")
  .select("id,name,quantity,buffer_days,active,status")
  .eq("id",booking.rental_item_id)
  .maybeSingle();
 if(itemError||!item)return {error:"Utleieproduktet ble ikke funnet.",status:404};
 if(item.active===false||item.status!=="available")return {error:"Utstyret er ikke tilgjengelig.",status:409};

 const buffer=Math.max(0,Number(item.buffer_days)||0);
 const start=new Date(booking.start_date+"T12:00:00Z");
 const end=new Date(booking.end_date+"T12:00:00Z");
 start.setUTCDate(start.getUTCDate()-buffer);
 end.setUTCDate(end.getUTCDate()+buffer);
 const from=start.toISOString().slice(0,10);
 const to=end.toISOString().slice(0,10);

 const [{data:conflicts,error:conflictError},{data:blocks,error:blockError}]=await Promise.all([
  s.from("rental_bookings").select("id")
   .eq("rental_item_id",booking.rental_item_id)
   .neq("id",booking.id)
   .in("status",["new","confirmed","active"])
   .lte("start_date",to)
   .gte("end_date",from),
  s.from("rental_blocks").select("id")
   .eq("rental_item_id",booking.rental_item_id)
   .lte("start_date",to)
   .gte("end_date",from)
 ]);
 if(conflictError||blockError)return {error:"Tilgjengelighet kunne ikke kontrolleres.",status:500};
 if((conflicts?.length||0)+(blocks?.length||0)>=Math.max(1,Number(item.quantity)||1)){
  return {error:"Kan ikke bekrefte: utstyret er opptatt i perioden.",status:409};
 }
 return {item};
}

async function sendCustomerMessage(req,s,booking,item,kind){
 const email=String(booking.customer?.email||"").trim().toLowerCase();
 if(!email)return {error:"Kunden mangler e-postadresse."};

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)return {error:"E-post er ikke konfigurert."};

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=rentalEmailFrom();
 const replyTo=rentalReplyTo();
 const base=rentalSiteUrl(req);
 const accountUrl=booking.customer_user_id?base+"/min-side":"";
 const confirmed=kind==="confirmation";
 const title=confirmed?"Utleien er bekreftet":"Utleiebookingen er avbrutt";
 const intro=confirmed
  ?`Vi har bekreftet bookingen av ${esc(item?.name||booking.rental_items?.name||"utstyret")}.`
  :`Vi har registrert at bookingen av ${esc(item?.name||booking.rental_items?.name||"utstyret")} er avbrutt.`;
 const fulfillment=booking.customer?.fulfillment==="delivery"?"Levering":"Henting";
 const address=String(booking.customer?.address||"").trim();

 const html=`<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND UTLEIE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">UTLEIE</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(booking.booking_number)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${title}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(booking.customer?.name||"kunde")}. ${intro}</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#8e887f">Periode</span><b style="color:#fff">${esc(date(booking.start_date))} – ${esc(date(booking.end_date))}</b></div>
<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Utlevering</span><b style="color:#fff">${fulfillment}</b></div>
${confirmed?`<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Leiepris</span><b style="color:#fff">${esc(kr(booking.total_ore))}</b></div>`:""}
${confirmed&&Number(booking.deposit_ore)>0?`<div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px"><span style="color:#8e887f">Depositum</span><b style="color:#fff">${esc(kr(booking.deposit_ore))}</b></div>`:""}
${confirmed&&address?`<div style="margin-top:12px;color:#8e887f;font-size:11px">ADRESSE</div><div style="margin-top:4px;color:#fff;font-weight:700">${esc(address)}</div>`:""}
</div>
${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
<p style="margin:24px 0 0;color:#8e887f;font-size:11px;line-height:1.55">${confirmed?"Ta kontakt dersom noe rundt henting eller levering må avklares.":"Hvis dette ikke stemmer, svar direkte på e-posten eller ring 471 54 898."}</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Utleie · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

 const result=await resend.emails.send({
  from,to:email,replyTo,
  subject:confirmed?"Utleien er bekreftet – "+booking.booking_number:"Utleiebookingen er avbrutt – "+booking.booking_number,
  html
 });
 if(result?.error)return {error:result.error.message||"E-posten kunne ikke sendes."};
 return {ok:true,email};
}

export async function GET(){
 if(!(await canView()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const [{data,error},{error:paymentProbeError}]=await Promise.all([
  s.from("rental_bookings").select("*,rental_items(name)").order("start_date",{ascending:true}),
  s.from("rental_bookings")
   .select("id,payment_reference,payment_captured_ore,receipt_sent_at,deposit_reference,deposit_held_ore,deposit_received_at,deposit_released_at,deposit_charged_ore")
   .limit(1)
 ]);
 if(error){
  if(error.code==="42P01")return NextResponse.json({bookings:[],setupRequired:true,paymentSetupRequired:true});
  console.error("RENTAL BOOKINGS GET",error);
  return NextResponse.json({error:"Utleiebookingene kunne ikke hentes."},{status:500});
 }
 const paymentSetupRequired=String(paymentProbeError?.code||"")==="42703";
 if(paymentProbeError&&!paymentSetupRequired)console.error("RENTAL PAYMENT SETUP PROBE",paymentProbeError);
 return NextResponse.json({bookings:(data||[]).map(map),paymentSetupRequired});
}

export async function PATCH(req){ const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await getAdminUser())||!(await hasPermission("canUpdateOrders")))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const b=await req.json().catch(()=>({}));
 const allowed=["new","confirmed","active","returned","completed","cancelled"];
 const payment=["unpaid","partial","paid","refunded"];
 const deposit=["not_paid","held","released","partially_charged","charged"];
 if(!b.id)return NextResponse.json({error:"Booking mangler."},{status:400});
 if(b.startDate!==undefined&&!validDate(b.startDate))return NextResponse.json({error:"Ugyldig startdato."},{status:400});
 if(b.endDate!==undefined&&!validDate(b.endDate))return NextResponse.json({error:"Ugyldig sluttdato."},{status:400});
 if(b.paymentReference!==undefined&&String(b.paymentReference||"").length>120)return NextResponse.json({error:"Betalingsreferansen er for lang."},{status:400});
 if(b.depositReference!==undefined&&String(b.depositReference||"").length>120)return NextResponse.json({error:"Depositumreferansen er for lang."},{status:400});

 const {data:current,error:currentError}=await s.from("rental_bookings")
  .select("*,rental_items(name)")
  .eq("id",b.id)
  .maybeSingle();
 if(currentError||!current)return NextResponse.json({error:"Bookingen ble ikke funnet."},{status:404});

 const action=String(b.action||"");
 let item=current.rental_items||null;

 if(action==="record-paid-and-send-receipt"){
  const email=String(current.customer?.email||"").trim().toLowerCase();
  if(!email)return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});
  const total=Math.max(0,Number(current.total_ore)||0);
  if(total<=0)return NextResponse.json({error:"Bookingen har ikke et gyldig leiebeløp."},{status:400});
  const reference=String(b.paymentReference??current.payment_reference??"").trim()||"Manuelt registrert";
  const now=new Date().toISOString();
  const {error:paymentError}=await s.from("rental_bookings").update({
   payment_status:"paid",
   payment_reference:reference,
   payment_captured_ore:total,
   updated_at:now
  }).eq("id",b.id);
  if(paymentError){
   if(String(paymentError.code||"")==="42703")return NextResponse.json({error:"Databaseoppdateringen for utleiebetaling mangler.",setupRequired:true},{status:409});
   console.error("RENTAL PAYMENT UPDATE",paymentError);
   return NextResponse.json({error:"Leiebetalingen kunne ikke registreres."},{status:500});
  }

  const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY):process.env.RESEND_API_KEY;
  if(!resendKey)return NextResponse.json({error:"Leiebetalingen er registrert, men e-post er ikke konfigurert.",statusSaved:true},{status:503});
  try{
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const from=rentalEmailFrom();
   const replyTo=rentalReplyTo();
   const base=rentalSiteUrl(req);
   const accountUrl=current.customer_user_id?base+"/min-side":"";
   const fulfillment=current.customer?.fulfillment==="delivery"?"Levering":"Henting";
   const customerAddress=String(current.customer?.address||"").trim();
   const dayCount=Math.max(1,Number(current.price_snapshot?.days)||Math.round((new Date(current.end_date+"T12:00:00Z")-new Date(current.start_date+"T12:00:00Z"))/86400000)+1);
   const receiptData={
    orderNumber:current.booking_number,
    customerName:current.customer?.name||"kunde",
    customerEmail:email,
    customerPhone:current.customer?.phone||"",
    customerAddress,
    fulfillmentLabel:fulfillment,
    reference,
    items:[{
     quantity:1,
     name:"Leie – "+(current.rental_items?.name||"Utleieutstyr"),
     unitPriceOre:total,
     details:[
      {label:"Periode",value:date(current.start_date)+" – "+date(current.end_date)},
      {label:"Antall dager",value:String(dayCount)},
      {label:"Utlevering",value:fulfillment}
     ]
    }],
    shippingOre:0,
    totalOre:total,
    paidAt:now,
    accountUrl,
    vatRate:25,
    numberLabel:"Bookingnummer",
    itemsSectionLabel:"Leie",
    depositInfo:Number(current.deposit_ore)>0?{
     amountOre:Number(current.deposit_ore)||0,
     statusLabel:current.deposit_status==="held"?"Holdes":current.deposit_status==="released"?"Frigitt":current.deposit_status==="partially_charged"?"Delvis brukt":current.deposit_status==="charged"?"Brukt":"Ikke registrert",
     reference:current.deposit_reference||"",
     note:"Depositumet holdes separat og er ikke inkludert i leiebeløpet eller totalsummen på denne kvitteringen."
    }:null
   };
   const html=buildReceiptEmail(receiptData);
   const pdf=await buildReceiptPdf(receiptData);
   const sent=await resend.emails.send({
    from,to:email,replyTo,
    subject:"Betalingsbekreftelse utleie – "+current.booking_number,
    html,
    attachments:[
     {filename:"aadland-service-logo.webp",path:"https://www.aadland-service.no/aadland-service-logo.webp",contentId:"aadland-service-logo"},
     {filename:receiptPdfFilename(current.booking_number),content:pdf.toString("base64")}
    ]
   });
   if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
   const receiptSentAt=new Date().toISOString();
   const {error:stampError}=await s.from("rental_bookings").update({receipt_sent_at:receiptSentAt,updated_at:receiptSentAt}).eq("id",b.id);
   if(stampError)console.error("RENTAL RECEIPT STAMP",stampError);
   return NextResponse.json({ok:true,sentTo:email,receiptSentAt,paymentStatus:"paid",paymentReference:reference});
  }catch(e){
   console.error("RENTAL RECEIPT EMAIL ERROR",e);
   return NextResponse.json({error:"Leiebetalingen er registrert, men kvitteringen kunne ikke sendes.",statusSaved:true},{status:500});
  }
 }

 if(action==="record-deposit-held"){
  const amount=Math.max(0,Number(current.deposit_ore)||0);
  if(amount<=0)return NextResponse.json({error:"Denne bookingen har ikke depositum."},{status:400});
  const reference=String(b.depositReference??current.deposit_reference??"").trim()||"Manuelt registrert";
  const now=new Date().toISOString();
  const {error}=await s.from("rental_bookings").update({
   deposit_status:"held",
   deposit_reference:reference,
   deposit_held_ore:amount,
   deposit_received_at:now,
   deposit_released_at:null,
   deposit_charged_ore:0,
   updated_at:now
  }).eq("id",b.id);
  if(error){
   if(String(error.code||"")==="42703")return NextResponse.json({error:"Databaseoppdateringen for depositum mangler.",setupRequired:true},{status:409});
   console.error("RENTAL DEPOSIT HOLD",error);
   return NextResponse.json({error:"Depositumet kunne ikke registreres."},{status:500});
  }
  return NextResponse.json({ok:true,depositStatus:"held",depositReference:reference});
 }

 if(action==="release-deposit"){
  if(Number(current.deposit_ore||0)<=0)return NextResponse.json({error:"Denne bookingen har ikke depositum."},{status:400});
  const now=new Date().toISOString();
  const {error}=await s.from("rental_bookings").update({
   deposit_status:"released",
   deposit_released_at:now,
   deposit_charged_ore:0,
   updated_at:now
  }).eq("id",b.id);
  if(error){
   if(String(error.code||"")==="42703")return NextResponse.json({error:"Databaseoppdateringen for depositum mangler.",setupRequired:true},{status:409});
   console.error("RENTAL DEPOSIT RELEASE",error);
   return NextResponse.json({error:"Depositumet kunne ikke frigis."},{status:500});
  }
  return NextResponse.json({ok:true,depositStatus:"released"});
 }

 if(action==="record-deposit-charge"){
  const maximum=Math.max(0,Number(current.deposit_ore)||0);
  const amount=Math.max(0,Math.round(Number(b.depositChargedOre)||0));
  if(maximum<=0)return NextResponse.json({error:"Denne bookingen har ikke depositum."},{status:400});
  if(amount<=0||amount>maximum)return NextResponse.json({error:"Beløpet som brukes av depositumet må være større enn 0 og ikke høyere enn depositumet."},{status:400});
  const status=amount>=maximum?"charged":"partially_charged";
  const now=new Date().toISOString();
  const {error}=await s.from("rental_bookings").update({
   deposit_status:status,
   deposit_charged_ore:amount,
   updated_at:now
  }).eq("id",b.id);
  if(error){
   if(String(error.code||"")==="42703")return NextResponse.json({error:"Databaseoppdateringen for depositum mangler.",setupRequired:true},{status:409});
   console.error("RENTAL DEPOSIT CHARGE",error);
   return NextResponse.json({error:"Bruken av depositumet kunne ikke registreres."},{status:500});
  }
  return NextResponse.json({ok:true,depositStatus:status,depositChargedOre:amount});
 }

 if(action==="confirm-and-send"||b.status==="confirmed"||b.status==="active"){
  const available=await checkAvailability(s,current);
  if(available.error)return NextResponse.json({error:available.error},{status:available.status||409});
  item=available.item;
 }

 if(action==="confirm-and-send"||action==="cancel-and-send"){
  if(!String(current.customer?.email||"").trim())return NextResponse.json({error:"Kunden mangler e-postadresse."},{status:400});
  const resendKey=process.env.VERCEL_ENV==="preview"
   ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
   :process.env.RESEND_API_KEY;
  if(!resendKey)return NextResponse.json({error:"E-post er ikke konfigurert."},{status:503});
 }

 const now=new Date().toISOString();
 const changes={updated_at:now};

 if(action==="confirm-and-send"){
  changes.status="confirmed";
 }else if(action==="cancel-and-send"){
  changes.status="cancelled";
 }else if(b.status!==undefined){
  if(!allowed.includes(b.status))return NextResponse.json({error:"Ugyldig status."},{status:400});
  changes.status=b.status;
 }

 if(b.paymentStatus!==undefined){
  if(!payment.includes(b.paymentStatus))return NextResponse.json({error:"Ugyldig betalingsstatus."},{status:400});
  changes.payment_status=b.paymentStatus;
 }
 if(b.depositStatus!==undefined){
  if(!deposit.includes(b.depositStatus))return NextResponse.json({error:"Ugyldig depositumstatus."},{status:400});
  changes.deposit_status=b.depositStatus;
 }
 if(b.adminNote!==undefined){
  if(String(b.adminNote||"").length>5000)return NextResponse.json({error:"Internt notat kan være maks 5000 tegn."},{status:400});
  changes.admin_note=String(b.adminNote||"");
 }

 const {error}=await s.from("rental_bookings").update(changes).eq("id",b.id);
 if(error){console.error("RENTAL BOOKING UPDATE",error);return NextResponse.json({error:"Bookingen kunne ikke oppdateres."},{status:500});}

 if(action==="confirm-and-send"||action==="cancel-and-send"){
  const updated={...current,...changes};
  const kind=action==="confirm-and-send"?"confirmation":"cancellation";
  const sent=await sendCustomerMessage(req,s,updated,item,kind);
  if(sent.error){
   return NextResponse.json({
    error:(kind==="confirmation"?"Bookingen er bekreftet":"Bookingen er avbrutt")+", men e-posten kunne ikke sendes: "+sent.error,
    statusSaved:true
   },{status:500});
  }
  const stamp=kind==="confirmation"
   ?{confirmation_sent_at:now,cancellation_sent_at:null,reminder_sent_at:null}
   :{cancellation_sent_at:now};
  const {error:stampError}=await s.from("rental_bookings").update({...stamp,updated_at:new Date().toISOString()}).eq("id",b.id);
  if(stampError&&!["42703"].includes(String(stampError.code||"")))console.error("RENTAL NOTIFICATION STAMP",stampError);
  return NextResponse.json({ok:true,sentTo:sent.email,kind});
 }

 return NextResponse.json({ok:true});
}
