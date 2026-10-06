import "server-only";

export async function rentalBillingDecision(s,email,newBookingOre=0){
 const normalized=String(email||"").trim().toLowerCase();
 const extra=Math.max(0,Number(newBookingOre)||0);
 if(!s||!normalized)return {eligible:false,reason:"payment",invoiceCustomer:false,creditLimitOre:null,exposureOre:0};

 const {data:profile,error}=await s.from("customer_billing_profiles")
  .select("email,invoice_customer,credit_limit_ore,note")
  .eq("email",normalized)
  .maybeSingle();

 if(error){
  if(String(error.code||"")!=="42P01")console.error("RENTAL BILLING PROFILE",error);
  return {eligible:false,reason:"payment",invoiceCustomer:false,creditLimitOre:null,exposureOre:0};
 }

 const invoiceCustomer=profile?.invoice_customer===true;
 const creditLimitOre=profile?.credit_limit_ore==null?null:Math.max(0,Number(profile.credit_limit_ore)||0);
 const hasCreditLimit=Number.isFinite(creditLimitOre)&&creditLimitOre>0;

 if(!invoiceCustomer&&!hasCreditLimit){
  return {eligible:false,reason:"payment",invoiceCustomer:false,creditLimitOre:null,exposureOre:0};
 }

 if(invoiceCustomer&&!hasCreditLimit){
  return {eligible:true,reason:"invoice",invoiceCustomer:true,creditLimitOre:null,exposureOre:0};
 }

 const {data:rows,error:bookingError}=await s.from("rental_bookings")
  .select("total_ore,payment_captured_ore,payment_refunded_ore,status")
  .contains("customer",{email:normalized})
  .in("status",["new","confirmed","active","returned","completed"]);

 if(bookingError){
  console.error("RENTAL CREDIT EXPOSURE",bookingError);
  return {eligible:false,reason:"credit-check-error",invoiceCustomer,creditLimitOre,exposureOre:0};
 }

 const exposureOre=(rows||[]).reduce((sum,row)=>{
  const total=Math.max(0,Number(row.total_ore)||0);
  const captured=Math.max(0,Number(row.payment_captured_ore)||0);
  const refunded=Math.max(0,Number(row.payment_refunded_ore)||0);
  const netPaid=Math.max(0,captured-refunded);
  return sum+Math.max(0,total-netPaid);
 },0);

 const eligible=exposureOre+extra<=creditLimitOre;
 return {
  eligible,
  reason:eligible?"credit":"credit-limit",
  invoiceCustomer,
  creditLimitOre,
  exposureOre,
  remainingCreditOre:Math.max(0,creditLimitOre-exposureOre)
 };
}
