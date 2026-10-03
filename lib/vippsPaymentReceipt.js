import "server-only";
import {fromDbProduct} from "./supabase";
import {buildReceiptEmail} from "./receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "./receiptPdf";
import {rentalBookingSiteUrl,rentalEmailFrom,rentalReplyTo} from "./rentalEmailConfig";
import {serviceEmailFrom,serviceReplyTo} from "./serviceEmailConfig";

function date(value){
 if(!value)return "";
 const d=new Date(value+"T12:00:00");
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("nb-NO",{day:"2-digit",month:"2-digit",year:"numeric"});
}

function serviceBase(req){
 const requestOrigin=(()=>{
  try{return req?new URL(req.url).origin:"";}catch{return "";}
 })();
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").trim().replace(/\/$/,"");
 if(process.env.VERCEL_ENV==="preview"&&requestOrigin)return requestOrigin;
 return configured||requestOrigin||"https://www.aadland-service.no";
}

async function clearClaim(s,unit,id){
 const table=unit==="rental"?"rental_bookings":"orders";
 const {error}=await s.from(table).update({receipt_sending_at:null,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)console.error("PAYMENT RECEIPT CLAIM CLEAR ERROR",{unit,id,message:error.message});
}

async function stampSent(s,unit,id){
 const table=unit==="rental"?"rental_bookings":"orders";
 const sentAt=new Date().toISOString();
 const {error}=await s.from(table).update({
  receipt_sent_at:sentAt,
  receipt_sending_at:null,
  updated_at:sentAt
 }).eq("id",id);
 if(error)throw error;
 return sentAt;
}

async function claim(s,unit,id){
 const {data,error}=await s.rpc("claim_payment_receipt",{target_unit:unit,target_id:id});
 if(error)throw error;
 return data===true;
}

async function sendServiceReceipt({s,id,req,resend}){
 const {data:order,error}=await s.from("orders").select("*").eq("id",id).maybeSingle();
 if(error)throw error;
 if(!order)return {sent:false,reason:"missing"};
 if(order.order_type!=="order"||String(order.payment_provider||"").toLowerCase()!=="vipps"||order.payment_status!=="paid"){
  return {sent:false,reason:"not-ready"};
 }

 const email=String(order.customer?.email||"").trim().toLowerCase();
 if(!email)return {sent:false,reason:"email-missing"};

 const total=Math.max(0,Number(order.total_ore)||0);
 if(total<=0)return {sent:false,reason:"amount-invalid"};

 const rawItems=Array.isArray(order.items)?order.items:[];
 const productIds=[...new Set(rawItems.map(item=>String(item?.productId||"")).filter(Boolean))];
 const productById=new Map();
 if(productIds.length){
  const {data:productRows,error:productError}=await s.from("products").select("*").in("id",productIds);
  if(!productError){
   for(const row of productRows||[]){
    const product=fromDbProduct(row);
    productById.set(String(product.id),product);
   }
  }else{
   console.error("VIPPS RECEIPT PRODUCT DETAILS ERROR",{id,message:productError.message});
  }
 }

 const receiptItems=rawItems.map(item=>{
  const product=productById.get(String(item?.productId||""));
  const selected=item?.selectedOptions&&typeof item.selectedOptions==="object"?item.selectedOptions:{};
  const details=(product?.options||[]).map(option=>{
   const value=selected[option.id];
   const choice=(option.choices||[]).find(entry=>entry.value===value);
   if(value==null&&!choice)return null;
   return {label:option.label||option.id||"Valg",value:choice?.label||String(value??"")};
  }).filter(Boolean);
  return {...item,details};
 });

 let quoteNumber="",quoteNote="";
 const {data:linkedQuote,error:quoteError}=await s.from("quotes")
  .select("quote_number,notes")
  .eq("converted_order_id",order.id)
  .maybeSingle();
 if(!quoteError&&linkedQuote){
  quoteNumber=linkedQuote.quote_number||"";
  quoteNote=linkedQuote.notes||"";
 }else if(quoteError&&!["42P01","42703"].includes(String(quoteError.code||""))){
  console.error("VIPPS RECEIPT QUOTE LOOKUP ERROR",{id,message:quoteError.message});
 }

 const base=serviceBase(req);
 const receiptData={
  orderNumber:order.order_number,
  customerName:order.customer?.name||"kunde",
  customerEmail:email,
  customerPhone:order.customer?.phone||"",
  customerAddress:[order.customer?.address,order.customer?.postalCode,order.customer?.city].filter(Boolean).join(", "),
  fulfillmentLabel:order.fulfillment_type==="delivery"?"Levering":order.fulfillment_type==="shipping"?"Sending med post/Bring":"Henting",
  reference:order.payment_reference||order.order_number,
  items:receiptItems,
  shippingOre:Number(order.shipping_ore)||0,
  totalOre:total,
  paidAt:order.payment_captured_at||order.created_at,
  accountUrl:order.customer_user_id?base+"/min-side":"",
  orderNote:order.customer?.note||order.custom_request||"",
  quoteNumber,
  quoteNote,
  vatRate:25
 };
 const html=buildReceiptEmail(receiptData);
 const pdf=await buildReceiptPdf(receiptData);
 const result=await resend.emails.send({
  from:serviceEmailFrom(),
  to:email,
  replyTo:serviceReplyTo(),
  subject:"Betalingsbekreftelse – "+order.order_number,
  html,
  attachments:[
   {filename:"aadland-service-logo.webp",path:"https://www.aadland-service.no/aadland-service-logo.webp",contentId:"aadland-service-logo"},
   {filename:receiptPdfFilename(order.order_number),content:pdf.toString("base64")}
  ]
 },{
  idempotencyKey:"payment-receipt/service/"+order.id
 });
 if(result?.error)throw new Error(result.error.message||"E-postfeil");
 const receiptSentAt=await stampSent(s,"service",order.id);
 return {sent:true,email,receiptSentAt,emailId:result?.data?.id||result?.id||null};
}

async function sendRentalReceipt({s,id,req,resend}){
 const {data:booking,error}=await s.from("rental_bookings")
  .select("*,rental_items(name)")
  .eq("id",id)
  .maybeSingle();
 if(error)throw error;
 if(!booking)return {sent:false,reason:"missing"};
 if(String(booking.payment_provider||"").toLowerCase()!=="vipps"||booking.payment_status!=="paid"){
  return {sent:false,reason:"not-ready"};
 }

 const email=String(booking.customer?.email||"").trim().toLowerCase();
 if(!email)return {sent:false,reason:"email-missing"};
 const total=Math.max(0,Number(booking.total_ore)||0);
 if(total<=0)return {sent:false,reason:"amount-invalid"};

 const base=rentalBookingSiteUrl(booking,req);
 const fulfillment=booking.customer?.fulfillment==="delivery"?"Levering":"Henting";
 const dayCount=Math.max(
  1,
  Number(booking.price_snapshot?.days)||
  Math.round((new Date(booking.end_date+"T12:00:00Z")-new Date(booking.start_date+"T12:00:00Z"))/86400000)+1
 );
 const receiptData={
  orderNumber:booking.booking_number,
  customerName:booking.customer?.name||"kunde",
  customerEmail:email,
  customerPhone:booking.customer?.phone||"",
  customerAddress:String(booking.customer?.address||"").trim(),
  fulfillmentLabel:fulfillment,
  reference:booking.payment_reference||booking.booking_number,
  items:[{
   quantity:1,
   name:"Leie – "+(booking.rental_items?.name||"Utleieutstyr"),
   unitPriceOre:total,
   details:[
    {label:"Periode",value:date(booking.start_date)+" – "+date(booking.end_date)},
    {label:"Antall dager",value:String(dayCount)},
    {label:"Utlevering",value:fulfillment}
   ]
  }],
  shippingOre:0,
  totalOre:total,
  paidAt:booking.payment_captured_at||booking.created_at,
  accountUrl:booking.customer_user_id?base+"/min-side":"",
  vatRate:25,
  numberLabel:"Bookingnummer",
  itemsSectionLabel:"Leie",
  brandName:"Aadland Utleie",
  brandSiteUrl:"https://www.aadlandutleie.no",
  brandEmail:"post@aadland-service.no",
  depositInfo:Number(booking.deposit_ore)>0?{
   amountOre:Number(booking.deposit_ore)||0,
   statusLabel:booking.deposit_status==="held"?"Holdes":booking.deposit_status==="released"?"Frigitt":booking.deposit_status==="partially_charged"?"Delvis brukt":booking.deposit_status==="charged"?"Brukt":"Ikke registrert",
   reference:booking.deposit_reference||"",
   note:"Depositumet holdes separat og er ikke inkludert i leiebeløpet eller totalsummen på denne kvitteringen."
  }:null
 };
 const html=buildReceiptEmail(receiptData);
 const pdf=await buildReceiptPdf(receiptData);
 const result=await resend.emails.send({
  from:rentalEmailFrom(),
  to:email,
  replyTo:rentalReplyTo(),
  subject:"Betalingsbekreftelse utleie – "+booking.booking_number,
  html,
  attachments:[
   {filename:"aadland-service-logo.webp",path:"https://www.aadland-service.no/aadland-service-logo.webp",contentId:"aadland-service-logo"},
   {filename:receiptPdfFilename(booking.booking_number),content:pdf.toString("base64")}
  ]
 },{
  idempotencyKey:"payment-receipt/rental/"+booking.id
 });
 if(result?.error)throw new Error(result.error.message||"E-postfeil");
 const receiptSentAt=await stampSent(s,"rental",booking.id);
 return {sent:true,email,receiptSentAt,emailId:result?.data?.id||result?.id||null};
}

export async function sendVippsPaymentReceiptIfNeeded({s,unit,id,req}){
 const key=unit==="rental"?"rental":"service";
 const claimed=await claim(s,key,id);
 if(!claimed)return {sent:false,reason:"not-claimed"};

 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey){
  await clearClaim(s,key,id);
  return {sent:false,reason:"email-not-configured"};
 }

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const result=key==="rental"
   ?await sendRentalReceipt({s,id,req,resend})
   :await sendServiceReceipt({s,id,req,resend});
  if(!result.sent)await clearClaim(s,key,id);
  return result;
 }catch(error){
  await clearClaim(s,key,id);
  throw error;
 }
}
