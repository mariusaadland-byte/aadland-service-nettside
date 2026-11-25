export function rentalAccountingReview(b){
 const total=b.totalOre??b.total_ore,captured=b.paymentCapturedOre??b.payment_captured_ore,refunded=b.paymentRefundedOre??b.payment_refunded_ore,held=b.depositHeldOre??b.deposit_held_ore,charged=b.depositChargedOre??b.deposit_charged_ore;
 const isAmount=v=>Number.isSafeInteger(v)&&v>=0;
 if(![total,captured,refunded,held,charged].every(isAmount)||refunded>captured||charged>held)return {valid:false,reason:"Beløpene må avstemmes manuelt."};
 const paidAt=b.paymentCapturedAt??b.payment_captured_at;
 const paid=b.paymentStatus??b.payment_status;
 const reference=b.paymentReference??b.payment_reference;
 const eligible=total>0&&captured===total&&refunded===0&&paid==="paid"&&typeof reference==="string"&&reference.trim().length>0&&typeof paidAt==="string"&&Number.isFinite(Date.parse(paidAt));
 const netOre=captured-refunded;
 return {valid:true,agreedOre:total,capturedOre:captured,refundedOre:refunded,netOre,depositHeldOre:held,depositUsedOre:charged,depositRemainingOre:held-charged,depositClosed:Boolean(b.depositReleasedAt??b.deposit_released_at),receiptEligible:eligible,reason:eligible?"":"Kvitteringskopi krever fullt registrert leiebeløp, betalingsdato og referanse, uten tilbakebetaling."};
}
