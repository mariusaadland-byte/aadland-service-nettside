import {createHash} from "node:crypto";
import {canonicalDamageClaim} from "./damagePublication.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
// Read-only derived plan. All facts must be loaded by trusted server.
export function damageReview({group,bookings,returns,claims,responses,deposit,settlement}){
 if(!rentalUnitId(group?.id)||!rentalUnitId(group?.customer_user_id)||!Number.isSafeInteger(group.deposit_ore)||group.deposit_ore<0||![bookings,returns,claims,responses].every(Array.isArray))return null;
 if(!bookings.length||bookings.some(b=>b.group_id!==group.id||b.customer_user_id!==group.customer_user_id)||new Set(bookings.map(b=>b.id)).size!==bookings.length)return null;
 const rows=[];
 for(const c of claims){
  const b=bookings.find(x=>x.id===c.booking_id),r=returns.find(x=>x.booking_id===c.booking_id),answer=responses.find(x=>x.claim_id===c.id);
  if(!b||!r||r.group_id!==group.id||c.group_id!==group.id||canonicalDamageClaim(c)!==c.claim_digest||answer&&(answer.customer_id!==group.customer_user_id||answer.claim_digest!==c.claim_digest||!["accepted","disputed"].includes(answer.response)))return null;
  rows.push({id:c.id,description:c.description,amountOre:c.amount_ore,response:answer?.response??null,note:answer?.note??"",digest:c.claim_digest,bookingNumber:b.booking_number});
 }
 if(new Set(rows.map(r=>r.id)).size!==rows.length||!rows.length)return null;
 const accepted=rows.filter(r=>r.response==="accepted").reduce((a,r)=>a+r.amountOre,0);
 const allReturned=bookings.every(b=>b.status==="returned"&&returns.some(r=>r.booking_id===b.id&&r.group_id===group.id));
 const depositVerified=group.deposit_ore===0||deposit?.group_id===group.id&&deposit.amount_ore===group.deposit_ore;
 const reason=settlement?"already_planned":group.status!=="fulfilled"?"wrong_state":rows.some(r=>r.response==="disputed")?"disputed":rows.some(r=>r.response!== "accepted")?"waiting":!allReturned?"inspection":!depositVerified?"deposit":accepted>group.deposit_ore?"excess":accepted<=0?"no_claim":null;
 const reviewDigest=createHash("sha256").update(JSON.stringify(["damage-review-v1",group.id,group.deposit_ore,rows.map(r=>[r.id,r.digest,r.response]).sort((a,b)=>a[0].localeCompare(b[0])),bookings.map(b=>[b.id,b.status]).sort((a,b)=>a[0].localeCompare(b[0])),deposit?.proof_digest??null])).digest("hex");
 return {groupId:group.id,orderNumber:String(group.order_number),depositOre:group.deposit_ore,claims:rows,acceptedOre:accepted,refundOre:reason?null:group.deposit_ore-accepted,reason,reviewDigest,settlement:settlement?{refundOre:settlement.refund_ore,retainedOre:settlement.retained_ore,closed:!!settlement.closed_at}:null};
}
