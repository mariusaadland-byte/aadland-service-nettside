// Accounting only for ACTUALLY RETAINED Vipps fees, not capture-fee
// estimates or fees that Vipps has separately invoiced.
const integer=n=>typeof n==="number"&&Number.isSafeInteger(n);
const validDay=value=>typeof value==="string"&&/^20\d\d-\d\d-\d\d$/.test(value)&&
 Number.isFinite(Date.parse(value+"T00:00:00Z"))&&
 new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;

export function vippsFeeMarker(unit,pspReference){
 if(unit!=="service"||typeof pspReference!=="string"||
  !/^[A-Za-z0-9_-]{4,100}$/.test(pspReference))
  throw Error("Ugyldig Vipps-gebyrreferanse.");
 const marker="ASVF-"+unit+"-"+pspReference;
 if(marker.length>125)throw Error("Gebyrreferansen er for lang.");
 return marker;
}

export function retainedVippsFeePlan(funds,fees,feeId,day){
 if(!Array.isArray(funds)||!Array.isArray(fees)||!validDay(day))
  throw Error("Ufullstendig oppgjørsgrunnlag fra Vipps.");
 vippsFeeMarker("service",feeId);
 if(funds.some(x=>x.type==="payout-scheduled"))
  throw Error("Denne datoen har en Vipps-utbetaling. Bruk vanlig oppgjørsoverføring, ikke separat gebyrføring.");
 const matching=funds.filter(x=>x.type==="fees-retained"&&
  x.pspReference===feeId&&x.date===day);
 const mirrored=fees.filter(x=>x.type==="fees-retained"&&
  x.pspReference===feeId&&x.date===day);
 if(matching.length!==1||mirrored.length!==1)
  throw Error("Fant ikke nøyaktig ett samsvarende trukket gebyr i Vipps fonds- og gebyrrapport.");
 const fund=matching[0],fee=mirrored[0];
 if(!integer(fund.amountOre)||fund.amountOre>=0||
  !integer(fee.amountOre)||fee.amountOre!==-fund.amountOre||
  !integer(fund.balanceBefore)||!integer(fund.balanceAfter)||
  fund.balanceBefore+fund.amountOre!==fund.balanceAfter)
  throw Error("Vipps-gebyret stemmer ikke med regnskapsgrunnlaget. Ingen bokføring.");
 return {feeId,date:day,amountOre:-fund.amountOre,
  balanceBeforeOre:fund.balanceBefore,balanceAfterOre:fund.balanceAfter,
  type:"fees-retained",bankPayoutOre:0,
  scope:"Kun trukket gebyr: ingen fiktiv bankutbetaling og ingen ny salgsføring."};
}

export function tripletexRetainedFeeVoucher(plan,{unit,customerId,customerAccountId,feeAccountId}){
 if(!plan||!validDay(plan.date)||!integer(plan.amountOre)||plan.amountOre<=0||
  ![customerId,customerAccountId,feeAccountId].every(n=>integer(n)&&n>0)||
  customerAccountId===feeAccountId)
  throw Error("Ugyldig Vipps-gebyrbilag.");
 const marker=vippsFeeMarker(unit,plan.feeId);
 const ore=plan.amountOre/100;
 return {
  date:plan.date,description:"Vipps gebyr "+marker,
  postings:[
   {row:1,date:plan.date,amountGross:ore,amountGrossCurrency:ore,
    account:{id:feeAccountId},vatType:{id:0}},
   {row:2,date:plan.date,amountGross:-ore,amountGrossCurrency:-ore,
    account:{id:customerAccountId},customer:{id:customerId},vatType:{id:0}}
  ]
 };
}
