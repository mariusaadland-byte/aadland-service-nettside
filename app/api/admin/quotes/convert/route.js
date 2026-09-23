import {NextResponse} from "next/server";
import crypto from "crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

function orderNumber(){
 return "AS-"+Date.now().toString().slice(-8)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
}

export async function POST(req){
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const {id}=await req.json().catch(()=>({}));
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {data:quote,error:quoteError}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(quoteError||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 if(quote.status!=="accepted")return NextResponse.json({error:"Bare godkjente tilbud kan gjøres om til oppdrag."},{status:409});
 if(quote.converted_order_id)return NextResponse.json({error:"Det er allerede opprettet et oppdrag fra dette tilbudet.",orderId:quote.converted_order_id},{status:409});

 let customerUserId=null;
 if(quote.source_order_id){
  const {data:source}=await s.from("orders").select("customer_user_id").eq("id",quote.source_order_id).maybeSingle();
  customerUserId=source?.customer_user_id||null;
 }
 if(!customerUserId&&quote.customer?.email){
  const email=String(quote.customer.email).trim().toLowerCase();
  const {data:profile}=await s.from("customer_profiles").select("id").eq("email",email).maybeSingle();
  customerUserId=profile?.id||null;
 }

 const lineText=(Array.isArray(quote.line_items)?quote.line_items:[])
  .map(line=>`• ${line.description} — ${line.quantity} ${line.unit||""}`)
  .join("\n");

 const request=[
  `Godkjent tilbud ${quote.quote_number}`,
  quote.title||"",
  "",
  quote.intro_text||"",
  lineText?"\nArbeid og leveranser:\n"+lineText:"",
  quote.notes?"\nTilleggsinformasjon:\n"+quote.notes:""
 ].filter(Boolean).join("\n");

 const record={
  customer_user_id:customerUserId,
  order_number:orderNumber(),
  order_type:"custom",
  status:"confirmed",
  customer:quote.customer||{},
  fulfillment_type:"pickup",
  delivery_within_radius:null,
  items:[],
  custom_request:request,
  total_ore:Number(quote.total_inc_vat_ore)||0,
  shipping_ore:0,
  payment_status:"unpaid",
  terms_version:null,
  terms_accepted_at:null
 };

 const {data:order,error:orderError}=await s.from("orders").insert(record).select("id,order_number").single();
 if(orderError)return NextResponse.json({error:"Oppdraget kunne ikke opprettes."},{status:500});

 const {error:updateError}=await s.from("quotes").update({
  converted_order_id:order.id,
  updated_at:new Date().toISOString()
 }).eq("id",quote.id);

 if(updateError){
  await s.from("orders").delete().eq("id",order.id);
  if(String(updateError.code||"")==="42703")return NextResponse.json({error:"Databaseoppdatering mangler. Kjør supabase/quote_to_order.sql i Supabase først.",setupRequired:true},{status:409});
  return NextResponse.json({error:"Oppdraget kunne ikke kobles til tilbudet."},{status:500});
 }

 return NextResponse.json({ok:true,orderId:order.id,orderNumber:order.order_number});
}
