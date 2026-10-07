import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {rentalBillingDecision} from "../../../../lib/rentalBilling";
import {sendRentalConfirmation} from "../../../../lib/rentalConfirmationEmail";

async function canView(){
 return Boolean(await getAdminUser())&&Boolean(await hasPermission("canViewOrders"));
}

export async function GET(){
 if(!(await canView()))return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const [profilesResult,quotesResult,billingResult,creditBookingsResult]=await Promise.all([
  s.from("customer_profiles")
   .select("id,email,name,phone,address,created_at,updated_at")
   .order("created_at",{ascending:false})
   .limit(1000),
  s.from("quotes")
   .select("id,quote_number,title,status,total_inc_vat_ore,customer,valid_until,created_at,sent_at,accepted_at,declined_at")
   .order("created_at",{ascending:false})
   .limit(1000),
  s.from("customer_billing_profiles")
   .select("email,invoice_customer,credit_limit_ore,note,updated_at")
   .limit(5000),
  s.from("rental_bookings")
   .select("customer,total_ore,payment_captured_ore,payment_refunded_ore,status")
   .in("status",["new","confirmed","active","returned","completed"])
   .limit(5000)
 ]);

 if(profilesResult.error){
  if(String(profilesResult.error.code||"")==="42P01")return NextResponse.json({customers:[],quotes:[],setupRequired:true});
  console.error("ADMIN CUSTOMERS GET",profilesResult.error);
  return NextResponse.json({error:"Kundekontoene kunne ikke hentes."},{status:500});
 }

 if(billingResult.error&&!["42P01","42703"].includes(String(billingResult.error.code||""))){
  console.error("ADMIN CUSTOMER BILLING GET",billingResult.error);
 }
 if(creditBookingsResult.error&&!["42P01","42703"].includes(String(creditBookingsResult.error.code||""))){
  console.error("ADMIN CUSTOMER CREDIT EXPOSURE GET",creditBookingsResult.error);
 }

 const exposureMap=new Map();
 for(const booking of creditBookingsResult.data||[]){
  const email=String(booking.customer?.email||"").trim().toLowerCase();
  if(!email)continue;
  const total=Math.max(0,Number(booking.total_ore)||0);
  const captured=Math.max(0,Number(booking.payment_captured_ore)||0);
  const refunded=Math.max(0,Number(booking.payment_refunded_ore)||0);
  const netPaid=Math.max(0,captured-refunded);
  exposureMap.set(email,(exposureMap.get(email)||0)+Math.max(0,total-netPaid));
 }

 const billingMap=new Map((billingResult.data||[]).map(row=>{
  const email=String(row.email||"").toLowerCase();
  const limit=row.credit_limit_ore==null?null:Math.max(0,Number(row.credit_limit_ore)||0);
  const exposure=Math.max(0,Number(exposureMap.get(email))||0);
  return [email,{
   ...row,
   credit_exposure_ore:exposure,
   remaining_credit_ore:limit&&limit>0?Math.max(0,limit-exposure):null,
   credit_over_limit:Boolean(limit&&limit>0&&exposure>limit)
  }];
 }));

 let quotes=[];
 if(quotesResult.error){
  if(!["42P01","42703"].includes(String(quotesResult.error.code||""))){
   console.error("ADMIN CUSTOMER QUOTES GET",quotesResult.error);
  }
 }else{
  quotes=(quotesResult.data||[]).map(row=>({
   id:row.id,
   quoteNumber:row.quote_number||"",
   title:row.title||"Tilbud",
   status:row.status||"",
   totalOre:Number(row.total_inc_vat_ore)||0,
   customer:row.customer||{},
   validUntil:row.valid_until||null,
   createdAt:row.created_at||null,
   sentAt:row.sent_at||null,
   acceptedAt:row.accepted_at||null,
   declinedAt:row.declined_at||null
  }));
 }

 return NextResponse.json({
  customers:(profilesResult.data||[]).map(row=>{
   const billing=billingMap.get(String(row.email||"").toLowerCase())||{};
   return {
    id:row.id,
    email:row.email||"",
    name:row.name||"",
    phone:row.phone||"",
    address:row.address||"",
    createdAt:row.created_at||null,
    updatedAt:row.updated_at||null,
    hasAccount:true,
    invoiceCustomer:billing.invoice_customer===true,
    creditLimitOre:billing.credit_limit_ore==null?null:Number(billing.credit_limit_ore)||0,
    billingNote:billing.note||"",
    billingUpdatedAt:billing.updated_at||null,
    creditExposureOre:Number(billing.credit_exposure_ore)||0,
    remainingCreditOre:billing.remaining_credit_ore==null?null:Number(billing.remaining_credit_ore)||0,
    creditOverLimit:billing.credit_over_limit===true
   };
  }),
  billingProfiles:(billingResult.data||[]).map(row=>({
   email:row.email||"",
   invoiceCustomer:row.invoice_customer===true,
   creditLimitOre:row.credit_limit_ore==null?null:Number(row.credit_limit_ore)||0,
   billingNote:row.note||"",
   billingUpdatedAt:row.updated_at||null,
   creditExposureOre:Number(exposureMap.get(String(row.email||"").toLowerCase()))||0,
   remainingCreditOre:row.credit_limit_ore==null||Number(row.credit_limit_ore)<=0?null:Math.max(0,(Number(row.credit_limit_ore)||0)-(Number(exposureMap.get(String(row.email||"").toLowerCase()))||0)),
   creditOverLimit:row.credit_limit_ore!=null&&Number(row.credit_limit_ore)>0&&(Number(exposureMap.get(String(row.email||"").toLowerCase()))||0)>Number(row.credit_limit_ore)
  })),
  quotes
 });
}

export async function PATCH(req){
 const originError=sameOriginGuard(req);
 if(originError)return originError;
 if(!(await getAdminUser())||!(await hasPermission("canUpdateOrders"))){
  return NextResponse.json({error:"Ingen tilgang."},{status:403});
 }

 const b=await req.json().catch(()=>({}));
 const email=String(b.email||"").trim().toLowerCase();
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  return NextResponse.json({error:"Gyldig e-postadresse mangler."},{status:400});
 }

 const invoiceCustomer=b.invoiceCustomer===true;
 const creditLimitOre=b.creditLimitOre==null||b.creditLimitOre===""
  ?null
  :Math.max(0,Math.round(Number(b.creditLimitOre)||0));
 const note=String(b.billingNote||"").trim().slice(0,1000);

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const now=new Date().toISOString();
 const {error}=await s.from("customer_billing_profiles").upsert({
  email,
  invoice_customer:invoiceCustomer,
  credit_limit_ore:creditLimitOre,
  note:note||null,
  updated_at:now
 },{onConflict:"email"});
 if(error){
  console.error("ADMIN CUSTOMER BILLING PATCH",error);
  return NextResponse.json({error:"Faktura-/kredittinnstillingene kunne ikke lagres."},{status:500});
 }

 const decision=await rentalBillingDecision(s,email,0);
 let confirmationsSent=0;
 const confirmationErrors=[];

 if(decision.eligible){
  const {data:waiting,error:waitingError}=await s.from("rental_bookings")
   .select("*,rental_items(name)")
   .contains("customer",{email})
   .in("status",["new","confirmed"])
   .is("confirmation_sent_at",null)
   .order("created_at",{ascending:true});

  if(waitingError){
   console.error("ADMIN CUSTOMER BILLING WAITING",waitingError);
  }else{
   for(const booking of waiting||[]){
    try{
     if(booking.status==="new"){
      const {error:statusError}=await s.from("rental_bookings")
       .update({status:"confirmed",updated_at:new Date().toISOString()})
       .eq("id",booking.id);
      if(statusError)throw statusError;
      booking.status="confirmed";
     }
     await sendRentalConfirmation({
      booking,
      itemName:booking.rental_items?.name||"utstyret",
      req
     });
     const sentAt=new Date().toISOString();
     const {error:stampError}=await s.from("rental_bookings")
      .update({confirmation_sent_at:sentAt,updated_at:sentAt})
      .eq("id",booking.id);
     if(stampError)throw stampError;
     confirmationsSent+=1;
    }catch(e){
     console.error("ADMIN CUSTOMER AUTO CONFIRM",booking.id,e);
     confirmationErrors.push(booking.booking_number||booking.id);
    }
   }
  }
 }

 return NextResponse.json({
  ok:true,
  invoiceCustomer,
  creditLimitOre,
  billingDecision:decision,
  confirmationsSent,
  confirmationErrors
 });
}
