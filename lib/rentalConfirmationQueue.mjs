import {rentalUnitId} from "./rentalUnitQr.mjs";
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function validConfirmationSnapshot(x){
 if(!x||![x.pending,x.claimed,x.stale,x.review,x.accepted].every(count)||!Array.isArray(x.rows)||x.rows.length!==Math.min(50,x.pending+x.claimed+x.stale+x.review)||new Set(x.rows.map(r=>r?.group_id)).size!==x.rows.length)return null;
 if(x.rows.some(r=>!rentalUnitId(r?.group_id)||typeof r.number!=="string"||!/^\d+$/.test(r.number)||!["pending","claimed","stale","review"].includes(r.display_state)||!Number.isFinite(Date.parse(r.created_at))||r.claimed_at!==null&&!Number.isFinite(Date.parse(r.claimed_at))))return null;
 return x;
}
export async function runConfirmationQueue({candidates,send}){
 const rows=await candidates();
 if(!Array.isArray(rows)||rows.length>5||rows.some(r=>!rentalUnitId(r?.group_id))||new Set(rows.map(r=>r.group_id)).size!==rows.length)throw Error("CONFIRMATION_UNCONFIRMED");
 const result={selected:rows.length,accepted:0,review:0,skipped:0,unconfirmed:0};
 for(const {group_id} of rows){
  try{const r=await send(group_id);if(r?.status==="accepted")result.accepted++;else if(r?.status==="review")result.review++;else if(r?.status==="not_claimed")result.skipped++;else result.unconfirmed++;}
  catch{result.unconfirmed++;}
 }
 return result;
}
