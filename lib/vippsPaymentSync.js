import "server-only";

function amountValue(obj){
 const value=Number(obj?.value);
 return Number.isInteger(value)&&value>=0?value:0;
}

function ensureNok(obj){
 const currency=String(obj?.currency||"NOK").toUpperCase();
 if(currency!=="NOK"){
  const error=new Error("VIPPS_UNEXPECTED_CURRENCY");
  error.code="VIPPS_UNEXPECTED_CURRENCY";
  throw error;
 }
}

export async function syncVippsPaymentSnapshot(s,unit,reference,payment){
 const aggregate=payment?.aggregate||{};
 for(const key of ["authorizedAmount","cancelledAmount","capturedAmount","refundedAmount"]){
  if(aggregate[key])ensureNok(aggregate[key]);
 }

 const authorizedOre=amountValue(aggregate.authorizedAmount);
 const cancelledOre=amountValue(aggregate.cancelledAmount);
 const capturedOre=amountValue(aggregate.capturedAmount);
 const refundedOre=amountValue(aggregate.refundedAmount);

 const {data,error}=await s.rpc("sync_vipps_payment_snapshot",{
  target_unit:unit,
  target_reference:reference,
  payment_state_value:String(payment?.state||""),
  psp_reference_value:String(payment?.pspReference||""),
  authorized_ore_value:authorizedOre,
  cancelled_ore_value:cancelledOre,
  captured_ore_value:capturedOre,
  refunded_ore_value:refundedOre,
  capture_guaranteed_until_value:payment?.captureGuaranteedUntil||null
 });
 if(error)throw error;

 if(unit==="service"&&String(data?.status||"").toLowerCase()==="cancelled"&&capturedOre<=refundedOre&&data?.id){
  const {error:cancelError}=await s.rpc("cancel_product_order_once",{
   target_order_id:data.id,
   customer_reason:"Vipps-betalingen ble avbrutt eller utløp før den kunne fullføres."
  });
  if(cancelError)throw cancelError;
 }

 return {
  db:data,
  state:String(payment?.state||""),
  authorizedOre,
  cancelledOre,
  capturedOre,
  refundedOre,
  remainingCaptureOre:Math.max(0,authorizedOre-cancelledOre-capturedOre),
  remainingRefundOre:Math.max(0,capturedOre-refundedOre),
  captureGuaranteedUntil:payment?.captureGuaranteedUntil||null
 };
}
