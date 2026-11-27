import {rentalUnitId} from "./rentalUnitQr.mjs";
export function rentalManualUrl(value){
 if(typeof value!=="string"||value.length>1800||/[\x00-\x20\x7f\\]/.test(value.trim()))return null;
 try{const u=new URL(value.trim());if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||u.port||u.hostname.endsWith(".local")||/^\d|^\[/.test(u.hostname))return null;return u.href;}catch{return null;}
}
export function rentalManualPageUrl(id){return rentalUnitId(id)?"https://www.aadlandutleie.no/utleie/bruksanvisning/"+id.toLowerCase():null;}
export function rentalManualInput(b){
 if(!rentalUnitId(b?.requestId)||!rentalUnitId(b?.itemId)||b.verified!==true||typeof b.published!=="boolean")return null;
 const field=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\x00-\x1f]/.test(v)?v.trim():null;
 const manufacturer=field(b.manufacturer,120),model=field(b.model,120),url=rentalManualUrl(b.url),language=field(b.language,40);
 if(!manufacturer||!model||!url||!language||typeof b.safetyNote!=="string"||b.safetyNote.trim().length>2000)return null;
 return {id:b.requestId.toLowerCase(),rental_item_id:b.itemId.toLowerCase(),manufacturer,model,manual_url:url,language,safety_note:b.safetyNote.trim(),published:b.published};
}
export function rentalManualMatches(a,b){return !!a&&Object.keys(b).every(k=>a[k]===b[k]);}
