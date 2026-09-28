import "server-only";
import {fromDbProduct} from "./supabase";
import {buildReceiptEmail} from "./receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "./receiptPdf";

export async function sendOrderReceipt({s,order,reference,paidAt,requestOrigin}){
 if(!s||!order)throw new Error("ORDER_RECEIPT_MISSING_CONTEXT");
 const email=String(order.customer?.email||"").trim().toLowerCase();
 if(!email)throw new Error("ORDER_RECEIPT_EMAIL_MISSING");
 const total=Math.max(0,Number(order.total_ore)||0);
 if(total<=0)throw new Error("ORDER_RECEIPT_AMOUNT_INVALID");
 const resendKey=process.env.VERCEL_ENV==="preview"
  ?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY)
  :process.env.RESEND_API_KEY;
 if(!resendKey)throw new Error("ORDER_RECEIPT_EMAIL_NOT_CONFIGURED");

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
 const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const origin=String(requestOrigin||configuredOrigin||"").replace(/\/$/,"");
 const base=process.env.VERCEL_ENV==="preview"?(origin||configuredOrigin):(configuredOrigin||origin);
 const accountUrl=order.customer_user_id&&base?base+"/min-side":"";

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
   console.error("ORDER RECEIPT PRODUCT DETAILS ERROR",productError);
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
 const {data:linkedQuote,error:quoteLookupError}=await s.from("quotes")
  .select("quote_number,notes")
  .eq("converted_order_id",order.id)
  .maybeSingle();
 if(!quoteLookupError&&linkedQuote){
  quoteNumber=linkedQuote.quote_number||"";
  quoteNote=linkedQuote.notes||"";
 }else if(quoteLookupError&&!["42P01","42703"].includes(String(quoteLookupError.code||""))){
  console.error("ORDER RECEIPT QUOTE NOTE ERROR",quoteLookupError);
 }

 const customerAddress=[order.customer?.address,order.customer?.postalCode,order.customer?.city].filter(Boolean).join(", ");
 const fulfillmentLabel=order.fulfillment_type==="delivery"?"Levering":order.fulfillment_type==="shipping"?"Sending med post/Bring":"Henting";
 const receiptData={
  orderNumber:order.order_number,
  customerName:order.customer?.name||"kunde",
  customerEmail:order.customer?.email||"",
  customerPhone:order.customer?.phone||"",
  customerAddress,
  fulfillmentLabel,
  reference:String(reference||order.payment_reference||"").trim()||"Betaling registrert",
  items:receiptItems,
  shippingOre:Number(order.shipping_ore)||0,
  totalOre:total,
  paidAt:paidAt||new Date().toISOString(),
  accountUrl,
  orderNote:order.customer?.note||order.custom_request||"",
  quoteNumber,
  quoteNote,
  vatRate:25
 };
 const html=buildReceiptEmail(receiptData);
 const pdf=await buildReceiptPdf(receiptData);
 const sent=await resend.emails.send({
  from,to:email,replyTo,
  subject:"Betalingsbekreftelse – "+order.order_number,
  html,
  attachments:[
   {
    filename:"aadland-service-logo.webp",
    path:"https://www.aadland-service.no/aadland-service-logo.webp",
    contentId:"aadland-service-logo"
   },
   {
    filename:receiptPdfFilename(order.order_number),
    content:pdf.toString("base64")
   }
  ]
 });
 if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
 const receiptSentAt=new Date().toISOString();
 const {error:stampError}=await s.from("orders").update({receipt_sent_at:receiptSentAt,updated_at:receiptSentAt}).eq("id",order.id);
 if(stampError)console.error("ORDER RECEIPT STAMP ERROR",stampError);
 return {sentTo:email,receiptSentAt};
}
