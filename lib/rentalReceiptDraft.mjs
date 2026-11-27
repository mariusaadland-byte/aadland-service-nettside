import {createHash} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
// Pure draft: callers must load evidence from trusted server-side records.
// No database writes, email, accounting posting or production activation.
const positive=n=>Number.isSafeInteger(n)&&n>0;
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const reference=s=>typeof s==="string"&&/^[A-Za-z0-9_.:/-]{1,200}$/.test(s);
export function rentalReceiptDraft({group,event}={}){
 if(!rentalUnitId(group?.id)||event?.groupId!==group.id||event.currency!=="NOK"||event.status!=="confirmed"||!positive(event.amountOre)||!reference(event.reference)||!reference(event.eventId)||typeof event.confirmedAt!=="string"||!Number.isFinite(Date.parse(event.confirmedAt)))return null;
 const kind=event.kind;
 if(!["payment","deposit","deposit_refund"].includes(kind))return null;
 if(kind==="payment"&&(!positive(group.payable_ore)||event.amountOre!==group.payable_ore||event.reference!==group.payment_reference))return null;
 if(kind==="deposit"&&(!positive(group.deposit_ore)||event.amountOre!==group.deposit_ore))return null;
 if(kind==="deposit_refund"&&(!positive(event.originalDepositOre)||!nonnegative(event.previousRefundOre)||event.previousRefundOre>event.originalDepositOre||event.amountOre>event.originalDepositOre-event.previousRefundOre||event.originalDepositOre!==group.deposit_ore))return null;
 const identity=createHash("sha256").update(JSON.stringify([group.id,kind,event.eventId])).digest("hex");
 return Object.freeze({identity,groupId:group.id,kind,amountOre:event.amountOre,currency:"NOK",reference:event.reference,confirmedAt:new Date(event.confirmedAt).toISOString(),accountingClass:kind==="payment"?"sales_payment":"deposit_liability",sender:"noreply@aadlandutleie.no"});
}
