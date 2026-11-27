import {createHash} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const BANK_IMAGE_MAX=2*1024*1024;
export function bankEvidenceInput({groupId,kind,reference,amountOre,requestId}={}){
 if(!rentalUnitId(groupId)||!["deposit","record_refund"].includes(kind)||typeof reference!=="string"||!reference.trim()||reference.trim().length>200||!Number.isSafeInteger(amountOre)||amountOre<=0||amountOre>2147483647||kind==="record_refund"&&!rentalUnitId(requestId))return null;
 return {groupId,kind,reference:reference.trim(),amountOre,requestId:kind==="deposit"?null:requestId};
}
export function bankImageDigest(bytes){
 return Buffer.isBuffer(bytes)&&bytes.length>=32&&bytes.length<=BANK_IMAGE_MAX&&bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?createHash("sha256").update(bytes).digest("hex"):null;
}
