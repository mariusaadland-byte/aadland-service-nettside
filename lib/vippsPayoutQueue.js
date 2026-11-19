// Conservative, client-side selection and preflight validation for Vipps payouts.
// A planned Vipps payout is NEVER proof that cash reached the bank.
// All actual accounting writes remain guarded by the existing owner-only
// /api/admin/tripletex/vipps-transfer endpoint and unique database claims.
export const MAX_VIPPS_PAYOUT_BATCH=5;
export const payoutQueueKey=row=>String(row?.date||"")+"|"+String(row?.pspReference||"");
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const validDate=x=>typeof x==="string"&&/^20\d\d-\d\d-\d\d$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;

export function vippsPayoutQueue({unit,rows,complete,unknownEntryTypes=0}){
 const issues=[];
 if(unit!=="service")issues.push("Samlet utbetalingskontroll er kun for Aadland Service.");
 if(!complete)issues.push("Vipps-perioden er ikke komplett lagret.");
 if(unknownEntryTypes>0)issues.push("Vipps inneholder ukjente posttyper.");
 if(!Array.isArray(rows))return {eligible:[],confirmedCount:0,reviewCount:0,
  issues:[...issues,"Listen over utbetalinger mangler."]};
 const counts=new Map();
 for(const row of rows){
  const id=payoutQueueKey(row);
  counts.set(id,(counts.get(id)||0)+1);
 }
 if([...counts.values()].some(n=>n>1))
  issues.push("Dupliserte utbetalingsreferanser er sperret og krever manuell kontroll.");
 const eligible=rows.filter(row=>
  row?.tripletexStatus==="not_transferred"&&!row.transferMismatch&&
  counts.get(payoutQueueKey(row))===1&&validDate(row?.date)&&
  /^[A-Za-z0-9_-]{4,100}$/.test(String(row.pspReference||""))&&
  Number.isSafeInteger(row.amountOre)&&row.amountOre>0
 ).sort((a,b)=>a.date.localeCompare(b.date)||
  a.pspReference.localeCompare(b.pspReference));
 const reviewCount=rows.filter(row=>row?.transferMismatch||
  ["processing","needs_review"].includes(row?.tripletexStatus)).length;
 if(reviewCount)issues.push(reviewCount+" utbetalinger må kontrolleres enkeltvis.");
 return {eligible:unit==="service"&&complete&&unknownEntryTypes===0?eligible:[],
  confirmedCount:rows.filter(x=>x.tripletexStatus==="confirmed"&&!x.transferMismatch).length,
  reviewCount,issues};
}
export function validVippsPayoutPreview(row,preview){
 const plan=preview?.plan;
 const feeAccounts=Array.isArray(preview?.feeAccounts)?
  preview.feeAccounts.filter(a=>Number(a.number)===7770&&validId(a.id)):[];
 const bankAccounts=Array.isArray(preview?.bankAccounts)?
  preview.bankAccounts.filter(a=>validId(a.id)&&Number(a.number)>=1900&&
   Number(a.number)<2000):[];
 return Boolean(preview?.ok===true&&preview?.ready===true&&!preview?.previous&&
  typeof preview.digest==="string"&&/^[0-9a-f]{64}$/.test(preview.digest)&&
  Number(preview.customer?.number)===10009&&
  /vipps/i.test(String(preview.customer?.name||""))&&
  plan?.payoutId===row?.pspReference&&plan?.payoutDate===row?.date&&
  Number.isSafeInteger(plan.payoutOre)&&plan.payoutOre===row?.amountOre&&
  Number.isSafeInteger(plan.grossOre)&&plan.grossOre>0&&
  Number.isSafeInteger(plan.feeOre)&&plan.feeOre>=0&&
  plan.grossOre===plan.feeOre+plan.payoutOre&&
  Number.isSafeInteger(plan.previouslyBookedFeeOre)&&
  plan.previouslyBookedFeeOre>=0&&plan.previouslyBookedFeeOre<=plan.feeOre&&
  Number.isSafeInteger(plan.paymentCount)&&plan.paymentCount>=1&&
  feeAccounts.length===1&&bankAccounts.length>=1&&
  new Set(bankAccounts.map(a=>Number(a.id))).size===bankAccounts.length);
}
