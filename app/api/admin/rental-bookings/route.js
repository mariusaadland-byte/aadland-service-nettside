import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

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
 depositStatus:b.deposit_status||"not_paid",
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
 const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
 const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
 const requestOrigin=new URL(req.url).origin;
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
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
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">UTLEIE</div></td></tr>
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
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
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
 const {data,error}=await s.from("rental_bookings").select("*,rental_items(name)").order("start_date",{ascending:true});
 if(error){
  if(error.code==="42P01")return NextResponse.json({bookings:[],setupRequired:true});
  console.error("RENTAL BOOKINGS GET",error);\n  return NextResponse.json({error:"Utleiebookingene kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({bookings:(data||[]).map(map)});
}

export async function PATCH(req){
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

 const {data:current,error:currentError}=await s.from("rental_bookings")
  .select("*,rental_items(name)")
  .eq("id",b.id)
  .maybeSingle();
 if(currentError||!current)return NextResponse.json({error:"Bookingen ble ikke funnet."},{status:404});

 const action=String(b.action||"");
 let item=current.rental_items||null;

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
