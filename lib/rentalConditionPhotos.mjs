export const CONDITION_BUCKET="rental-condition-images";
export const CONDITION_MAX_BYTES=4*1024*1024;
export const CONDITION_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
export const conditionId=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const conditionPhase=v=>v==="before"||v==="after";
export function conditionCanUpload(booking,phase){
 return !!booking&&!booking.archived_at&&(phase==="before"?booking.status==="confirmed":phase==="after"&&["active","returned"].includes(booking.status));
}
export function conditionImageValid(type,bytes){
 if(!bytes||bytes.length>CONDITION_MAX_BYTES)return false;
 if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==="image/png")return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(type==="image/webp")return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 return false;
}
export function conditionObjectName(adminId,digest,type){
 if(!conditionId(adminId)||!/^[a-f0-9]{64}$/.test(digest)||!CONDITION_TYPES[type])return null;
 return adminId.toLowerCase()+"-"+digest+"."+CONDITION_TYPES[type];
}
export function conditionStoredName(v){return typeof v==="string"&&/^[a-f0-9-]{36}-[a-f0-9]{64}\.(jpg|png|webp)$/.test(v);}
