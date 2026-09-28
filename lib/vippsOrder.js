import "server-only";

function amountValue(value){
 return Math.max(0,Math.round(Number(value?.value)||0));
}

export async function syncVippsOrderFromPayment(s,order,payment){
 if(!s||!order||!payment)return {ok:false};
 const total=Math.max(0,Number(order.total_ore)||0);
 const authorized=amountValue(payment.aggregate?.authorizedAmount);
 const captured=amountValue(payment.aggregate?.capturedAmount);
 const cancelled=amountValue(payment.aggregate?.cancelledAmount);
 const refunded=amountValue(payment.aggregate?.refundedAmount);
 const state=String(payment.state||"").toUpperCase();
 const now=new Date().toISOString();

 let paymentStatus="pending";
 if(refunded>0&&captured>0&&refunded>=captured)paymentStatus="refunded";
 else if(captured>=total&&total>0)paymentStatus="paid";
 else if(captured>0)paymentStatus="partial";
 else if(authorized>0&&cancelled>=authorized)paymentStatus="cancelled";
 else if(["ABORTED","EXPIRED","TERMINATED","CANCELLED"].includes(state))paymentStatus="cancelled";
 else if(authorized>0||state==="AUTHORIZED")paymentStatus="authorized";

 const patch={
  payment_provider:"vipps",
  payment_psp_reference:payment.pspReference||order.payment_psp_reference||null,
  payment_reserved_ore:authorized,
  payment_captured_ore:captured,
  payment_refunded_ore:refunded,
  payment_status:paymentStatus,
  payment_capture_guaranteed_until:payment.captureGuaranteedUntil||null,
  ...(authorized>0&&!order.payment_authorized_at?{payment_authorized_at:now}:{}),
  ...(captured>0?{payment_captured_at:order.payment_captured_at||now}:{}),
  ...(refunded>0?{payment_refunded_at:order.payment_refunded_at||now}:{}),
  ...(["ABORTED","EXPIRED","TERMINATED","CANCELLED"].includes(state)?{payment_cancelled_at:order.payment_cancelled_at||now}:{}),
  updated_at:now
 };

 const terminalWithoutCapture=captured===0&&(
  ["ABORTED","EXPIRED","TERMINATED","CANCELLED"].includes(state)||
  (authorized>0&&cancelled>=authorized)
 );
 if(terminalWithoutCapture)patch.status="cancelled";

 const {error}=await s.from("orders").update(patch).eq("id",order.id);
 if(error)throw error;

 let stockReleased=false;
 if(terminalWithoutCapture&&!order.payment_stock_released_at){
  const {data,error:releaseError}=await s.rpc("release_order_stock_once",{target_order_id:order.id});
  if(releaseError)throw releaseError;
  stockReleased=data===true;
 }

 return {ok:true,paymentStatus,authorized,cancelled,captured,refunded,state,stockReleased};
}
