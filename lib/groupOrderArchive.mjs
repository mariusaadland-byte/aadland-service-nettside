import {bankImageDigest,BANK_IMAGE_MAX} from "./groupBankEvidence.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
const digest=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function bankArchiveBytes(row,groupId,kind,hash){
 if(!rentalUnitId(groupId)||!["deposit","record_refund"].includes(kind)||!digest(hash)||row?.group_id!==groupId||row.kind!==kind||row.digest!==hash)return null;
 const raw=row.image_bytes;
 const bytes=Buffer.isBuffer(raw)?raw:typeof raw==="string"&&raw.length<=BANK_IMAGE_MAX*2+2&&/^\\x(?:[0-9a-f]{2})+$/i.test(raw)?Buffer.from(raw.slice(2),"hex"):null;
 return bytes&&bankImageDigest(bytes)===hash?bytes:null;
}
export function bankArchiveRows({group,documents,deposit,settlement}){
 if(!rentalUnitId(group?.id)||!Array.isArray(documents)||documents.length>10)return null;
 const out=[];
 for(const d of documents){
  if(d.group_id!==group.id||!digest(d.digest)||!["deposit","record_refund"].includes(d.kind)||!Number.isSafeInteger(d.amount_ore)||d.amount_ore<=0||typeof d.reference!=="string"||!d.reference.trim())return null;
  const used=d.kind==="deposit"?deposit?.proof_digest===d.digest&&deposit.amount_ore===d.amount_ore&&deposit.reference===d.reference:!!settlement?.closed_at&&settlement.transfer_digest===d.digest&&settlement.refund_ore===d.amount_ore&&settlement.refund_reference===d.reference&&settlement.request_id===d.request_id;
  out.push({kind:d.kind,digest:d.digest,amountOre:d.amount_ore,reference:d.reference,createdAt:d.created_at,used,url:"/api/admin/rental/group-bank-archive/"+group.id+"/"+d.kind+"/"+d.digest});
 }
 return out;
}
// Candidate review only. No posting, invoice number, accounting accounts or external transfer.
export function groupAccountingReview({group,claim,signed,deposit,settlement,documents}){
 const q=checkFrozenGroupQuote(group);
 if(!q)return null;
 const snapshot=q.snapshot;
 const lines=[...snapshot.rentals.map(r=>({kind:"rental",description:r.name+" · "+r.startDate+" – "+r.endDate,quantity:r.quantity,grossOre:r.totalOre})),...snapshot.goods.map(r=>({kind:"goods",description:r.name,quantity:r.quantity,grossOre:r.totalOre}))].map(r=>({...r,vatOre:Math.round(r.grossOre/5),netOre:r.grossOre-Math.round(r.grossOre/5)}));
 const grossOre=lines.reduce((s,r)=>s+r.grossOre,0),vatOre=lines.reduce((s,r)=>s+r.vatOre,0);
 if(grossOre!==group.payable_ore)return null;
 const captureRecorded=!!claim?.captured_at&&!!claim.psp_reference&&claim.group_id===group.id&&claim.reference===group.payment_reference&&claim.amount_ore===grossOre;
 const depositRecorded=deposit?.group_id===group.id&&deposit.amount_ore===group.deposit_ore&&documents.some(d=>d.kind==="deposit"&&d.used);
 const refundRecorded=!!settlement?.closed_at&&settlement.group_id===group.id&&settlement.deposit_ore===group.deposit_ore&&settlement.refund_ore+settlement.retained_ore===group.deposit_ore&&(settlement.refund_ore===0||documents.some(d=>d.kind==="record_refund"&&d.used));
 return {reference:"rental-group:"+group.id,lines,grossOre,netOre:grossOre-vatOre,vatOre,vatAssumption:25,captureRecorded,signed:!!signed,depositExpectedOre:group.deposit_ore,depositRecordedOre:depositRecorded?deposit.amount_ore:null,refundRecordedOre:refundRecorded?settlement.refund_ore:null,retainedRecordedOre:refundRecorded?settlement.retained_ore:null,readyToPost:false};
}
