// Shared browser-safe validation; server additionally checks ownership and stored bytes.
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const digest=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function damageAmountOre(value){
 if(typeof value!=="string"||!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(value.trim()))return null;
 const [whole,fraction=""]=value.trim().replace(",",".").split(".");
 const n=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(n)&&n>0&&n<=2147483647?n:null;
}
export function damageFormPayload({id,selected,description,amount,photos,cost}={}){
 const n=damageAmountOre(amount),text=typeof description==="string"?description.trim():"";
 if(!uuid(id)||!uuid(selected?.groupId)||!uuid(selected?.bookingId)||!text||text.length>2000||n===null||!Array.isArray(photos)||photos.length<1||photos.length>12||!photos.every(digest)||new Set(photos).size!==photos.length||!digest(cost)||photos.includes(cost))return null;
 return {id,group_id:selected.groupId,booking_id:selected.bookingId,description:text,amount_ore:n,photo_digests:[...photos],cost_proof_digest:cost};
}
