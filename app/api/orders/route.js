import {NextResponse} from "next/server";
import crypto from "crypto";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {db,fromDbProduct} from "../../../lib/supabase";
import {productPrice} from "../../../lib/catalog";
function num(){return "AS-"+Date.now().toString().slice(-8)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase()}
export async function POST(req){
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
  const orderNumber=num(),now=new Date().toISOString(),customerUserId=await getCustomerUserId();
  const safeCustomer={...body.customer,name,email,phone,address:String(body.customer?.address||"").trim().slice(0,300),postalCode:String(body.customer?.postalCode||"").trim().slice(0,20),city:String(body.customer?.city||"").trim().slice(0,120),note:String(body.customer?.note||"").trim().slice(0,2000)};const record={customer_user_id:customerUserId,order_number:orderNumber,order_type:body.orderType==="custom"?"custom":"order",status:"new",customer:safeCustomer,fulfillment_type:body.fulfillmentType||"pickup",delivery_within_radius:!!body.deliveryWithinRadius,items,custom_request:body.customRequest?String(body.customRequest).trim():null,total_ore:total,shipping_ore:shipping,payment_status:body.orderType==="order"?"pending":"unpaid",terms_version:body.orderType==="order"?(body.termsVersion||"2026-09"):null,terms_accepted_at:body.orderType==="order"?now:null};
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
  if(process.env.RESEND_API_KEY){try{const {Resend}=await import("resend");const resend=new Resend(process.env.RESEND_API_KEY),from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>",replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";if(process.env.ORDER_EMAIL_TO)await resend.emails.send({from,to:process.env.ORDER_EMAIL_TO,replyTo,subject:`Ny bestilling ${orderNumber}`,text:`Ny bestilling fra ${safeCustomer.name}\nTelefon: ${safeCustomer.phone}\nE-post: ${safeCustomer.email}\nOrdre: ${orderNumber}`});await resend.emails.send({from,to:body.customer.email,replyTo,subject:body.orderType==="custom"?"Vi har mottatt forespørselen din":"Ordrebekreftelse "+orderNumber,text:body.orderType==="custom"?`Hei ${body.customer.name}!\n\nVi har mottatt forespørselen din hos Aadland Service. Referanse: ${orderNumber}.\nVi tar kontakt så snart vi kan.\n\nAadland Service\npost@aadland-service.no`:`Hei ${body.customer.name}!\n\nTakk for bestillingen. Ordrenummer: ${orderNumber}.\nSum: ${(total/100).toLocaleString("nb-NO")} kr.\nDette er en ordrebekreftelse. Kvittering sendes når betalingen senere er registrert/trukket.\n\nAadland Service\npost@aadland-service.no`})}catch(e){console.error("E-postfeil",e)}}
  return NextResponse.json({orderNumber,message:"Takk! Vi tar kontakt for å bekrefte bestillingen."});
 }catch(e){console.error(e);return NextResponse.json({error:"Bestillingen kunne ikke lagres."},{status:500})}
}