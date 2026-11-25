import "server-only";
import {buildOrderConfirmationEmail} from "./orderConfirmationEmail";
import {serviceEmailFrom,serviceReplyTo} from "./serviceEmailConfig";
export async function sendManualOrderConfirmationOnce({s,id}){
 if(process.env.VERCEL_ENV!=="production"||!process.env.RESEND_API_KEY)return {state:"unavailable"};
 const base=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 if(!/^https:\/\//.test(base))return {state:"unavailable"};
 const {data:o,error}=await s.rpc("claim_service_order_confirmation",{p_order_id:id});
 if(error)throw Error("S33_CLAIM_FAILED");
 if(!o)return {state:"not_claimed"};
 try{
  const email=String(o.customer?.email||"").trim().toLowerCase();
  if(!email)throw Error("missing_recipient");
  const minSideUrl=base+"/min-side";
  const html=buildOrderConfirmationEmail({orderNumber:o.order_number,customerName:o.customer?.name||"kunde",totalOre:Number(o.total_ore)||0,isCustom:false,fulfillmentType:o.fulfillment_type||"pickup",accountUrl:o.customer_user_id?minSideUrl:"",minSideUrl,vippsPending:false});
  const {Resend}=await import("./safeResend");
  const sent=await new Resend(process.env.RESEND_API_KEY).emails.send({from:serviceEmailFrom(),to:email,replyTo:serviceReplyTo(),subject:"Ordrebekreftelse "+o.order_number,html},{idempotencyKey:"service-order-confirmation/"+id});
  if(sent?.error||!sent?.data?.id)throw Error("provider_status_uncertain");
  const ack=await s.rpc("accept_service_order_confirmation",{p_order_id:id,p_provider_email_id:String(sent.data.id)});
  if(ack.error||ack.data!==true)throw Error("provider_accepted_journal_unknown");
  return {state:"accepted"};
 }catch(e){
  // No automatic resend after claim, including crash or provider timeout.
  console.error("S33 CONFIRMATION NEEDS REVIEW",{id});
  try{await s.from("service_order_confirmation_outbox").update({state:"needs_review"}).eq("order_id",id).eq("state","claimed");}catch{}
  return {state:"needs_review"};
 }
}
