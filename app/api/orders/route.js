import {NextResponse} from "next/server";
import crypto from "crypto";
import {db,fromDbProduct} from "../../../lib/supabase";
import {fallbackProducts,productPrice} from "../../../lib/catalog";
function num(){return "AS-"+Date.now().toString().slice(-8)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase()}
export async function POST(req){
 try{
  const body=await req.json();
  if(!body.customer?.name||!body.customer?.email||!body.customer?.phone)return NextResponse.json({error:"Fyll inn navn, e-post og telefon."},{status:400});
  const s=db(); if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
  let items=[],total=0,shipping=0,stockUpdates=[];
  if(body.orderType==="order"){
   if(body.acceptedTerms!==true)return NextResponse.json({error:"Du må godta salgsbetingelsene før bestilling."},{status:400});
   const rawItems=Array.isArray(body.items)?body.items:[];if(rawItems.length>50)return NextResponse.json({error:"For mange varelinjer i samme bestilling."},{status:400});const ids=[...new Set(rawItems.map(i=>String(i.productId||"")).filter(Boolean))];
   const {data,error:productError}=await s.from("products").select("*").in("id",ids);
   if(productError)throw productError;
   const products=(data?.length?data.map(fromDbProduct):fallbackProducts).filter(p=>ids.includes(p.id));
   for(const i of rawItems){
    const p=products.find(p=>p.id===i.productId); if(!p)continue;
    const quantity=Math.max(1,Math.floor(Number(i.quantity)||1));
    if(p.inventoryMode==="stock"){
     if((Number(p.stockQuantity)||0)<quantity)return NextResponse.json({error:p.name+" har ikke nok på lager."},{status:409});
     stockUpdates.push({id:p.id,next:(Number(p.stockQuantity)||0)-quantity});
    }
    if(!["pickup","delivery","shipping"].includes(body.fulfillmentType))return NextResponse.json({error:"Velg gyldig leveringsmåte."},{status:400});
    if(body.fulfillmentType==="shipping"){
     if(!p.shippable)return NextResponse.json({error:p.name+" kan ikke sendes med post/Bring."},{status:400});
     shipping+=(Number(p.shippingPriceOre)||0)*quantity;
    }
    const unit=productPrice(p,i.selectedOptions||{});
    items.push({...i,quantity,name:p.name,unitPriceOre:unit,inventoryMode:p.inventoryMode});
    total+=unit*quantity;
   }
   if(!items.length)return NextResponse.json({error:"Handlekurven er tom."},{status:400});
  }
  total+=shipping;
  const orderNumber=num(),now=new Date().toISOString();
  const record={order_number:orderNumber,order_type:body.orderType==="custom"?"custom":"order",status:"new",customer:body.customer,fulfillment_type:body.fulfillmentType||"pickup",delivery_within_radius:!!body.deliveryWithinRadius,items,custom_request:body.customRequest||null,total_ore:total,shipping_ore:shipping,payment_status:body.orderType==="order"?"pending":"unpaid",terms_version:body.orderType==="order"?(body.termsVersion||"2026-09"):null,terms_accepted_at:body.orderType==="order"?now:null};
  const {error}=await s.from("orders").insert(record); if(error)throw error;
  for(const update of stockUpdates){const {error:stockError}=await s.from("products").update({stock_quantity:update.next}).eq("id",update.id);if(stockError)console.error("STOCK UPDATE ERROR",stockError)}
  if(process.env.RESEND_API_KEY){try{const {Resend}=await import("resend");const resend=new Resend(process.env.RESEND_API_KEY),from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>",replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";if(process.env.ORDER_EMAIL_TO)await resend.emails.send({from,to:process.env.ORDER_EMAIL_TO,replyTo,subject:`Ny bestilling ${orderNumber}`,text:`Ny bestilling fra ${body.customer.name}\nTelefon: ${body.customer.phone}\nE-post: ${body.customer.email}\nOrdre: ${orderNumber}`});await resend.emails.send({from,to:body.customer.email,replyTo,subject:body.orderType==="custom"?"Vi har mottatt forespørselen din":"Ordrebekreftelse "+orderNumber,text:body.orderType==="custom"?`Hei ${body.customer.name}!\n\nVi har mottatt forespørselen din hos Aadland Service. Referanse: ${orderNumber}.\nVi tar kontakt så snart vi kan.\n\nAadland Service\npost@aadland-service.no`:`Hei ${body.customer.name}!\n\nTakk for bestillingen. Ordrenummer: ${orderNumber}.\nSum: ${(total/100).toLocaleString("nb-NO")} kr.\nDette er en ordrebekreftelse. Kvittering sendes når betalingen senere er registrert/trukket.\n\nAadland Service\npost@aadland-service.no`})}catch(e){console.error("E-postfeil",e)}}
  return NextResponse.json({orderNumber,message:"Takk! Vi tar kontakt for å bekrefte bestillingen."});
 }catch(e){console.error(e);return NextResponse.json({error:"Bestillingen kunne ikke lagres."},{status:500})}
}