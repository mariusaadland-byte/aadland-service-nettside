import {createHash} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {scanRentalUnit} from "./groupHandover.mjs";
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function unitReturnInput(body,actorId){
 const unitId=scanRentalUnit(body?.unitId);
 if(!unitId||![body?.groupId,body?.bookingId,body?.receiptId,actorId].every(rentalUnitId)||!["ok","damage","missing_accessory","uninspected"].includes(body.condition)||typeof body.note!=="string"||body.note.length>2000)return null;
 const note=body.note.trim();
 if(["damage","missing_accessory"].includes(body.condition)&&!note)return null;
 if(body.condition==="ok"&&!["equipment","condition","accessories"].every(k=>body.checks?.[k]===true))return null;
 return {groupId:body.groupId,bookingId:body.bookingId,unitId,receiptId:body.receiptId,actorId,condition:body.condition,note,digest:hash(["aadland-unit-return-v1",body.groupId,body.bookingId,unitId,body.receiptId,actorId,body.condition,note])};
}
export function resolutionInput(body,actorId){
 const unitId=scanRentalUnit(body?.unitId);
 if(!unitId||![body?.groupId,body?.bookingId,body?.maintenanceEventId,actorId].every(rentalUnitId)||body.confirmed!==true)return null;
 return {unitId,digest:hash(["aadland-unit-resolution-v1",body.groupId,body.bookingId,unitId,body.maintenanceEventId,actorId])};
}
export function refundReviewDigest(groupId,requestId,actorId){
 return [groupId,requestId,actorId].every(rentalUnitId)?hash(["aadland-clean-refund-v1",groupId,requestId,actorId]):null;
}
