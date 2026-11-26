import {rentalUnitId} from "./rentalUnitQr.mjs";
const prefix="EGET OPPDRAG | ";
function dateKey(v){
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T12:00:00Z");return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;
}
export function ownUseReason(reason){return typeof reason==="string"&&reason.startsWith(prefix)?reason.slice(prefix.length):null;}
export function ownUseInput(b,today){
 if(!rentalUnitId(b?.requestId)||!rentalUnitId(b?.itemId)||!dateKey(b.startDate)||!dateKey(b.endDate)||b.startDate<today||b.endDate<b.startDate||(+new Date(b.endDate+"T12:00:00Z")-+new Date(b.startDate+"T12:00:00Z"))/86400000>364)return null;
 if(typeof b.jobReference!=="string"||b.jobReference.trim().length<2||b.jobReference.trim().length>100||/[\x00-\x1f]/.test(b.jobReference))return null;
 if(typeof b.note!=="string"||b.note.trim().length>500)return null;
 return {id:b.requestId.toLowerCase(),rental_item_id:b.itemId.toLowerCase(),start_date:b.startDate,end_date:b.endDate,reason:prefix+b.jobReference.trim()+(b.note.trim()?" | "+b.note.trim():"")};
}
export function ownUseMatches(a,b){return !!a&&["id","rental_item_id","start_date","end_date","reason"].every(k=>a[k]===b[k]);}
