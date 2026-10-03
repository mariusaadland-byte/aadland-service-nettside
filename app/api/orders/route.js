import {rateLimitRequest} from "../../../lib/rateLimit";
import {sameOriginGuard} from "../../../lib/requestGuard";
import {NextResponse} from "next/server";
import crypto from "crypto";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {db,fromDbProduct} from "../../../lib/supabase";
import {productPrice} from "../../../lib/catalog";
import {buildOrderConfirmationEmail} from "../../../lib/orderConfirmationEmail";
import {createVippsPayment} from "../../../lib/vippsClient";
import {vippsUnitReadiness} from "../../../lib/vippsReadiness";
import {serviceEmailFrom,serviceReplyTo} from "../../../lib/serviceEmailConfig";
const SALES_TERMS_VERSION="2026-10";
function num(){return "AS-"+Date.now().toString().slice(-8)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase()}
export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const rateError=await rateLimitRequest(req,{"scope":"orders","max":15,"windowSeconds":900,"message":"For mange forespørsler på kort tid. Prøv igjen senere."}); if(rateError)return rateError;
 try{
  const body=await req.json();
  if(!["order","custom"].includes(body.orderType))return NextResponse.json({error:"Ugyldig bestillingstype."},{status:400});
  const email=String(body.customer?.email||"").trim().toLowerCase(),name=String(body.customer?.name||"").trim(),phone=String(body.customer?.phone||"").trim();
  if(!name||!email||!phone)return NextResponse.json({error:"Fyll inn navn, e-post og telefon."},{status:400});
  if(name.length>120||email.length>254||phone.length>40)return NextResponse.json({error:"Kontaktinformasjonen er for lang."},{status:400});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});
  if(body.orderType==="custom"&&!String(body.customRequest||"").trim())return NextResponse.json({error:"Beskriv hva du ønsker hjelp med."},{status:400});
  if(String(body.customRequest||"").length>12000)return NextResponse.json({error:"Forespørselen er for lang."},{status:400});
  const s=db(); if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  const requestedPaymentMethod=body.orderType==="order"&&body.paymentMethod==="vipps"?"vipps":"manual";
  if(body.orderType==="order"&&body.paymentMethod&&!["manual","vipps"].includes(body.paymentMethod))return NextResponse.json({error:"Ugyldig betalingsmåte."},{status:400});
  if(requestedPaymentMethod==="vipps"){
   const readiness=await vippsUnitReadiness(s,"service");
   if(!readiness.ready)return NextResponse.json({error:"Vipps er ikke klart for betaling ennå. Velg vanlig bestilling eller prøv senere."},{status:409});
  }
  let items=[],total=0,shipping=0,stockRequests=[];
  if(body.orderType==="order"){
   if(body.acceptedTerms!==true)return NextResponse.json({error:"Du må godta salgsbetingelsene før bestilling."},{status:400});
   const rawItems=Array.isArray(body.items)?body.items:[];if(!rawItems.length)return NextResponse.json({error:"Handlekurven er tom."},{status:400});if(rawItems.length>50)return NextResponse.json({error:"For mange varelinjer i samme bestilling."},{status:400});if(!["pickup","delivery","shipping"].includes(body.fulfillmentType))return NextResponse.json({error:"Velg gyldig leveringsmåte."},{status:400});for(const i of rawItems){const q=Number(i.quantity);if(!Number.isInteger(q)||q<1||q>999)return NextResponse.json({error:"Antall må være mellom 1 og 999."},{status:400})}const ids=[...new Set(rawItems.map(i=>String(i.productId||"")).filter(Boolean))];if(!ids.length||rawItems.some(i=>!String(i.productId||"")))return NextResponse.json({error:"Handlekurven inneholder en ugyldig vare."},{status:400});
   const {data,error:productError}=await s.from("products").select("*").in("id",ids);
   if(productError)throw productError;
   const products=(data||[]).map(fromDbProduct).filter(p=>ids.includes(p.id)&&p.active!==false);if(ids.length!==products.length)return NextResponse.json({error:"Et produkt er ikke tilgjengelig lenger. Oppdater handlekurven og prøv igjen."},{status:409});
   const requestedStock=new Map();for(const i of rawItems){const id=String(i.productId||"");requestedStock.set(id,(requestedStock.get(id)||0)+Number(i.quantity))}for(const p of products){if(p.inventoryMode==="stock"&&(Number(p.stockQuantity)||0)<(requestedStock.get(p.id)||0))return NextResponse.json({error:p.name+" har ikke nok på lager."},{status:409})}
   for(const i of rawItems){
    const p=products.find(p=>String(p.id)===String(i.productId)); if(!p)return NextResponse.json({error:"Et produkt er ikke tilgjengelig lenger. Oppdater handlekurven og prøv igjen."},{status:409});
    const quantity=Number(i.quantity);
    if(body.fulfillmentType==="shipping"){
     if(!p.shippable)return NextResponse.json({error:p.name+" kan ikke sendes med post/Bring."},{status:400});
     shipping+=(Number(p.shippingPriceOre)||0)*quantity;
    }
    const submitted=i.selectedOptions&&typeof i.selectedOptions==="object"?i.selectedOptions:{};
    const selectedOptions={};let invalidOption=false;
    for(const option of (p.options||[])){const value=submitted[option.id]??option.choices?.[0]?.value;if(!option.choices?.some(choice=>choice.value===value)){invalidOption=true;break}selectedOptions[option.id]=value}
    if(invalidOption)return NextResponse.json({error:"Et produktvalg er ikke gyldig lenger. Oppdater handlekurven og prøv igjen."},{status:400});
    const unit=productPrice(p,selectedOptions);
    items.push({productId:p.id,selectedOptions,quantity,name:p.name,unitPriceOre:unit,inventoryMode:p.inventoryMode});
    total+=unit*quantity;
   }
   stockRequests=products.filter(p=>p.inventoryMode==="stock").map(p=>({id:p.id,quantity:requestedStock.get(p.id)||0}));
  }
  total+=shipping;
  const address=String(body.customer?.address||"").trim().slice(0,300);
  const postalCode=String(body.customer?.postalCode||"").trim().slice(0,20);
  const city=String(body.customer?.city||"").trim().slice(0,120);
  if(body.orderType==="order"&&["delivery","shipping"].includes(body.fulfillmentType)&&(!address||!postalCode||!city)){
   return NextResponse.json({error:"Fyll inn adresse, postnummer og sted for levering eller sending."},{status:400});
  }
  const orderNumber=num(),now=new Date().toISOString(),customerUserId=await getCustomerUserId();
  const safeCustomer={name,email,phone,address,postalCode,city,note:String(body.customer?.note||"").trim().slice(0,2000)};
  const useVipps=body.orderType==="order"&&requestedPaymentMethod==="vipps";
  const record={customer_user_id:customerUserId,order_number:orderNumber,order_type:body.orderType==="custom"?"custom":"order",status:"new",customer:safeCustomer,fulfillment_type:body.fulfillmentType||"pickup",delivery_within_radius:body.fulfillmentType==="delivery"?null:false,items,custom_request:body.customRequest?String(body.customRequest).trim():null,total_ore:total,shipping_ore:shipping,payment_status:body.orderType==="order"?"pending":"unpaid",payment_provider:useVipps?"vipps":null,payment_reference:useVipps?orderNumber:null,vipps_checkout_started_at:useVipps?now:null,terms_version:body.orderType==="order"?SALES_TERMS_VERSION:null,terms_accepted_at:body.orderType==="order"?now:null};
  if(stockRequests.length){
   const {error:orderError}=await s.rpc("create_order_with_stock",{order_record:record,stock_requests:stockRequests});
   if(orderError){
    console.error("ATOMIC ORDER ERROR",orderError);
    if(String(orderError.message||"").includes("INSUFFICIENT_STOCK"))return NextResponse.json({error:"En vare ble nettopp utsolgt. Oppdater handlekurven og prøv igjen."},{status:409});
    throw orderError;
   }
  }else{
   const {error:orderError}=await s.from("orders").insert(record);
   if(orderError)throw orderError;
  }

  const {data:createdOrder,error:createdOrderError}=await s.from("orders").select("id").eq("order_number",orderNumber).single();
  if(createdOrderError||!createdOrder?.id)throw createdOrderError||new Error("ORDER_ID_MISSING");
  const orderId=createdOrder.id;

  let vippsRedirectUrl="";
  if(useVipps){
   const requestOrigin=new URL(req.url).origin;
   const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
   const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
   try{
    const payment=await createVippsPayment({
     unit:"service",
     reference:orderNumber,
     amountOre:total,
     phone:safeCustomer.phone,
     returnUrl:base+"/betaling/vipps?unit=service&reference="+encodeURIComponent(orderNumber),
     description:"Aadland Service "+orderNumber
    });
    vippsRedirectUrl=String(payment?.redirectUrl||"").trim();
    if(!vippsRedirectUrl)throw new Error("VIPPS_REDIRECT_URL_MISSING");
    if(payment?.pspReference){
     const stampAt=new Date().toISOString();
     const {error:stampError}=await s.from("orders").update({payment_psp_reference:String(payment.pspReference),updated_at:stampAt}).eq("id",orderId);
     if(stampError)console.error("VIPPS PRODUCT PSP STAMP ERROR",{orderNumber,message:stampError.message});
    }
   }catch(error){
    console.error("VIPPS PRODUCT CHECKOUT CREATE ERROR",{orderNumber,status:error?.status,code:error?.code});
    const failedAt=new Date().toISOString();
    try{
     await s.rpc("cancel_product_order_once",{target_order_id:orderId,customer_reason:"Vipps-betalingen kunne ikke startes."});
     await s.from("orders").update({payment_status:"cancelled",payment_cancelled_at:failedAt,updated_at:failedAt}).eq("id",orderId);
    }catch(cleanupError){
     console.error("VIPPS PRODUCT CHECKOUT CLEANUP ERROR",{orderNumber,message:cleanupError?.message});
    }
    return NextResponse.json({error:"Vipps-betalingen kunne ikke startes. Ingen betaling er gjennomført. Prøv igjen."},{status:502});
   }
  }

  let confirmationSent=false;
  const resendKey=process.env.VERCEL_ENV==="preview"?(process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY):process.env.RESEND_API_KEY;
  if(resendKey){
   const {Resend}=await import("resend");
   const resend=new Resend(resendKey);
   const from=serviceEmailFrom();
   const replyTo=serviceReplyTo();
   const isCustom=body.orderType==="custom";
   const requestOrigin=new URL(req.url).origin;
   const configuredOrigin=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
   const base=process.env.VERCEL_ENV==="preview"?requestOrigin:(configuredOrigin||requestOrigin);
   const minSideUrl=base+"/min-side";
   const accountUrl=customerUserId?minSideUrl:"";
   const customerHtml=buildOrderConfirmationEmail({
    orderNumber,
    customerName:safeCustomer.name,
    totalOre:total,
    isCustom,
    fulfillmentType:body.fulfillmentType||"pickup",
    accountUrl,
    minSideUrl,
    vippsPending:useVipps
   });

   try{
    const sent=await resend.emails.send({
     from,
     to:safeCustomer.email,
     replyTo,
     subject:isCustom?"Vi har mottatt forespørselen din":"Ordrebekreftelse "+orderNumber,
     html:customerHtml
    });
    if(sent?.error)throw new Error(sent.error.message||"E-postfeil");
    confirmationSent=true;
    const sentAt=new Date().toISOString();
    const {error:stampError}=await s.from("orders").update({confirmation_sent_at:sentAt,updated_at:sentAt}).eq("order_number",orderNumber);
    if(stampError)console.error("ORDER CONFIRMATION STAMP ERROR",stampError);
   }catch(e){
    console.error("CUSTOMER ORDER CONFIRMATION EMAIL ERROR",e);
   }

   if(process.env.ORDER_EMAIL_TO){
    try{
     const adminSent=await resend.emails.send({
      from,
      to:process.env.ORDER_EMAIL_TO,
      replyTo,
      subject:(isCustom?"Ny forespørsel ":"Ny bestilling ")+orderNumber,
      text:`Fra: ${safeCustomer.name}\nTelefon: ${safeCustomer.phone}\nE-post: ${safeCustomer.email}\nReferanse: ${orderNumber}`
     });
     if(adminSent?.error)throw new Error(adminSent.error.message||"E-postfeil");
    }catch(e){
     console.error("ADMIN ORDER NOTIFICATION EMAIL ERROR",e);
    }
   }
  }
    return NextResponse.json({orderNumber,confirmationSent,payment:useVipps?{method:"vipps",redirectUrl:vippsRedirectUrl}:{method:"manual"},message:useVipps?"Bestillingen er registrert. Du sendes videre til Vipps.":"Takk! Vi tar kontakt for å bekrefte bestillingen."});
 }catch(e){console.error(e);return NextResponse.json({error:"Bestillingen kunne ikke lagres."},{status:500})}
}