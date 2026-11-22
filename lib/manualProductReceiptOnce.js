import "server-only";
import {fromDbProduct} from "./supabase";
import {buildReceiptEmail} from "./receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "./receiptPdf";
import {serviceEmailFrom,serviceReplyTo} from "./serviceEmailConfig";

// S-26: only a never-attempted receipt can be sent. The DB claim happens
// AFTER local PDF generation. Uncertain provider outcomes are not retried.
export async function sendManualProductReceiptOnce(s,order,receipt,{
 requestUrl="https://www.aadland-service.no/api/admin/orders",
 sendEmail=null,buildPdf=buildReceiptPdf
}={}){
 const key=process.env.RESEND_API_KEY;
 if(!sendEmail&&!key)return {status:503,payload:{
  error:"Betalingen er registrert, men e-post er ikke konfigurert. Kvitteringen er ikke forsøkt sendt.",
  statusSaved:true,receiptState:"queued"
 }};
 const email=String(order.customer?.email||"").trim().toLowerCase();
 if(!email||receipt.recipient_email!==email)return {status:409,payload:{
  error:"Kundens e-post er endret. Kontroller mottaker før kvittering sendes.",
  statusSaved:true,receiptState:"queued"
 }};
 const total=Number(receipt.amount_ore);
 const reference=receipt.payment_reference;
 const requestOrigin=new URL(requestUrl).origin;
 const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 const base=configuredOrigin||requestOrigin;
 const accountUrl=order.customer_user_id?base+"/min-side":"";
 try{
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
        reference,
        items:receiptItems,
        shippingOre:Number(order.shipping_ore)||0,
        totalOre:total,
        paidAt:receipt.paid_at,
        accountUrl,
        orderNote:order.customer?.note||order.custom_request||"",
        quoteNumber,
        quoteNote,
        vatRate:25
      };
      const html=buildReceiptEmail(receiptData);
      const pdf=await buildPdf(receiptData);
  const {data:claim,error:claimError}=await s.rpc("claim_manual_product_receipt",{p_order_id:order.id});
  if(claimError||!claim?.id)return {status:409,payload:{
   error:"Kvitteringen er allerede under behandling, eller den kunne ikke låses for sending. Oppdater ordren.",
   statusSaved:true
  }};
  // Only THIS claim-holder can contact the provider. No caller may reset a
  // claimed or uncertain receipt to queued without an owner-led reconciliation.
  try{
   let transport=sendEmail;
   if(!transport){
    const {Resend}=await import("resend");
    const resend=new Resend(key);
    transport=(message,options)=>resend.emails.send(message,options);
   }
   const sent=await transport({
    from:serviceEmailFrom(),to:email,replyTo:serviceReplyTo(),
    subject:"Betalingsbekreftelse – "+order.order_number,
    html,
    attachments:[
     {filename:"aadland-service-logo.webp",
      path:"https://www.aadland-service.no/aadland-service-logo.webp",
      contentId:"aadland-service-logo"},
     {filename:receiptPdfFilename(order.order_number),
      content:pdf.toString("base64")}
    ]
   },{idempotencyKey:"manual-order-receipt/"+receipt.id});
   if(sent?.error||!sent?.data?.id)throw Error("S26_PROVIDER_ACCEPTANCE_UNCONFIRMED");
   const ack=await s.rpc("ack_manual_product_receipt",{
    p_receipt_id:receipt.id,p_provider_email_id:String(sent.data.id)
   });
   if(ack.error||!ack.data?.ok){
    console.error("MANUAL ORDER RECEIPT PROVIDER ACK DB FAILED",{orderId:order.id,code:ack.error?.code});
    return {status:503,payload:{
     error:"Resend aksepterte kvitteringen, men databasekvitteringen er uavklart. Sjekk leverandørloggen før noen ny utsending.",
     statusSaved:true,receiptNeedsReview:true
    }};
   }
   return {status:200,payload:{
    ok:true,sentTo:email,receiptSentAt:new Date().toISOString(),
    paymentStatus:"paid",paymentReference:reference,
    providerMessageId:String(sent.data.id),
    message:"Betalingen er registrert én gang. Resend aksepterte kvitteringen."
   }};
  }catch(e){
   console.error("MANUAL ORDER RECEIPT PROVIDER STATUS UNCERTAIN",
    {orderId:order.id,reason:String(e?.message||"").slice(0,75)});
   try{
    const held=await s.rpc("hold_manual_product_receipt",{
     p_receipt_id:receipt.id,p_issue:"provider_status_uncertain"
    });
    if(held.error)console.error("MANUAL ORDER RECEIPT HOLD ERROR",{orderId:order.id});
   }catch{console.error("MANUAL ORDER RECEIPT HOLD INTERRUPTED",{orderId:order.id});}
   return {status:503,payload:{
    error:"Betalingen er registrert, men Resend-statusen er usikker. Kontroller leverandørloggen før noe sendes på nytt.",
    statusSaved:true,receiptNeedsReview:true
   }};
  }
 }catch(e){
  // PDF/data preparation is BEFORE provider claim. A later explicit owner
  // click can safely attempt a still-queued receipt for the first time.
  console.error("MANUAL ORDER RECEIPT PREFLIGHT FAILED",{orderId:order.id,reason:String(e?.message||"").slice(0,75)});
  return {status:503,payload:{
   error:"Betalingen er registrert. Kvitteringen ble ikke forsøkt sendt og kan sendes når feilen er rettet.",
   statusSaved:true,receiptState:"queued"
  }};
 }
}
