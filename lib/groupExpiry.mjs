import {rentalUnitId} from "./rentalUnitQr.mjs";
const count=n=>Number.isSafeInteger(n)&&n>=0;
const reasons=["review","payment_review","expiry_review","expiry_waiting"];
export function validGroupFollowup(x){
 if(!x||![x.total,x.paymentReview,x.expiryReview,x.waiting].every(count)||x.total!==x.paymentReview+x.expiryReview+x.waiting||!Array.isArray(x.rows)||x.rows.length!==Math.min(50,x.total)||new Set(x.rows.map(r=>r?.id)).size!==x.rows.length)return null;
 if(x.rows.some(r=>!rentalUnitId(r?.id)||typeof r.number!=="string"||!/^\d+$/.test(r.number)||!["held","payment_pending","review"].includes(r.status)||!reasons.includes(r.reason)||!Number.isFinite(Date.parse(r.expires_at))||!count(r.payable_ore)||r.checked_at!==null&&!Number.isFinite(Date.parse(r.checked_at))))return null;
 return x;
}
// Never call a payment provider or create a new payment. Each attempt is a
// separate transaction; no cross-order item locks are held across attempts.
export async function runGroupExpiry({store}){
 const raw=await store.candidates();
 if(!Array.isArray(raw)||raw.length>10||raw.some(r=>!rentalUnitId(r?.group_id))||new Set(raw.map(r=>r.group_id)).size!==raw.length)throw Error("EXPIRY_UNCONFIRMED");
 const result={selected:raw.length,released:0,review:0,skipped:0,unconfirmed:0};
 for(const {group_id} of raw){
  try{const r=await store.attempt(group_id);if(["released","review","skipped"].includes(r))result[r]++;else result.unconfirmed++;}
  catch{result.unconfirmed++;}
 }
 return result;
}
