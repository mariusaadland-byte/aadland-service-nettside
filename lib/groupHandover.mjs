import {createHash} from "node:crypto";
import {rentalUnitId,rentalUnitUrl,rentalUnitLabel} from "./rentalUnitQr.mjs";
import {groupVippsReconcile} from "./rentalGroupVipps.mjs";
import {scanRentalUnit} from "./rentalScanInput.mjs";
export {scanRentalUnit} from "./rentalScanInput.mjs";
export function handoverReport({groupId,reportId,actorId,units,note,checks}={}){
 if(![groupId,reportId,actorId].every(rentalUnitId)||typeof note!=="string"||note.length>2000||!["identity","condition","instructions"].every(k=>checks?.[k]===true)||!Array.isArray(units)||!units.length||units.length>200)return null;
 const sorted=units.map(x=>({bookingId:x.bookingId,unitId:scanRentalUnit(x.unitId)})).sort((a,b)=>String(a.bookingId).localeCompare(String(b.bookingId)));
 if(sorted.some(x=>!rentalUnitId(x.bookingId)||!x.unitId)||new Set(sorted.map(x=>x.bookingId)).size!==sorted.length||new Set(sorted.map(x=>x.unitId)).size!==sorted.length)return null;
 return {groupId,reportId,actorId,units:sorted,note:note.trim(),digest:createHash("sha256").update(JSON.stringify(["aadland-handover-v1",groupId,reportId,actorId,sorted,note.trim(),true,true,true])).digest("hex")};
}
// A capture request is claimed only once. Unknown provider outcome = GET-only review.
export async function controlledGroupCapture({group,claim,reportId,actorId,provider,store}){
 if(group?.status!=="payment_pending"||claim?.group_id!==group.id||claim.reference!==group.payment_reference||claim.amount_ore!==group.payable_ore||!rentalUnitId(reportId)||!rentalUnitId(actorId))return {status:"review"};
 let payment;try{payment=await provider.get(claim.reference);}catch{return {status:"unconfirmed"};}
 const d=groupVippsReconcile({group,payment,unit:"rental"});
 if(d.action==="confirm_once")return {status:"reconcile"};
 if(d.action!=="authorized_not_captured")return {status:"review"};
 const r=await store.claim({groupId:group.id,reportId,actorId,psp:d.pspReference,amountOre:group.payable_ore});
 if(r!=="claimed")return {status:r==="existing"?"reconcile":"review"};
 try{await provider.capture(claim.reference,group.payable_ore,{idempotencyKey:createHash("sha256").update("aadland-group-capture:"+claim.reference).digest("hex")});}catch{return {status:"unconfirmed"};}
 return {status:"reconcile"};
}
