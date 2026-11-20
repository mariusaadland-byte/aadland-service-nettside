import {
 vippsFeeEstimateForPayments,
 vippsPriceForPayoutWithPayments
} from "./vippsFeeEstimate";

// Read-only estimates. The actual merchant agreement and Vipps settlements
// always take precedence. Amounts and fees are integer øre.
export const VIPPS_COST_PAYMENT_PLANS={
 once:{label:"Én betaling",shares:[100]},
 two:{label:"To betalinger (50/50)",shares:[50,50]},
 three:{label:"Tre betalinger (25/50/25)",shares:[25,50,25]},
 four:{label:"Fire betalinger (25/25/25/25)",shares:[25,25,25,25]}
};
export function parseVippsCostOre(value){
 const normalized=String(value??"").trim().replace(/[\s\u00a0\u202f]/g,"").replace(",",".");
 if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized))return null;
 const [whole,decimal=""]=normalized.split(".");
 const ore=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 return Number.isSafeInteger(ore)&&ore>=0&&ore<=10_000_000_000?ore:null;
}
export function parseVippsRateBps(value){
 const normalized=String(value??"").trim().replace(",",".");
 if(!/^\d{1,2}(?:\.\d{1,2})?$/.test(normalized))return null;
 const [whole,fraction=""]=normalized.split(".");
 const bps=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(bps)&&bps>=0&&bps<10000?bps:null;
}
export function calculateVippsCostPreview({type="invoice",price="1000",deposit="0",
 rate="2,99",fixed="1,00",plan="once",desired=""}={}){
 const amountOre=parseVippsCostOre(price);
 const depositOre=type==="rental"?parseVippsCostOre(deposit):0;
 const rateBps=parseVippsRateBps(rate);
 const fixedOre=parseVippsCostOre(fixed);
 const shares=type==="rental"?[100]:VIPPS_COST_PAYMENT_PLANS[plan]?.shares;
 if(!["invoice","rental"].includes(type)||amountOre===null||depositOre===null||
   rateBps===null||fixedOre===null||!shares)
  return {ok:false,error:"Kontroller beløp, MVA-inkludert kundepris, Vipps-sats og betalingsplan."};
 const terms={rateBps,fixedOre};
 const estimate=vippsFeeEstimateForPayments(amountOre,shares,terms);
 if(!estimate)return {ok:false,error:"Ugyldige gebyrvilkår eller beløp."};
 const requested=String(desired??"").trim();
 const desiredOre=requested?parseVippsCostOre(requested):null;
 if(requested&&(desiredOre===null||desiredOre<=0))
  return {ok:false,error:"Skriv ønsket utbetaling som et positivt kronebeløp."};
 const suggested=desiredOre===null?null:
  vippsPriceForPayoutWithPayments(desiredOre,shares,terms);
 if(desiredOre!==null&&!suggested)
  return {ok:false,error:"Ønsket utbetaling kan ikke beregnes med disse vilkårene."};
 return {
  ok:true,type,amountOre,depositOre,rateBps,fixedOre,
  shares,paymentCount:estimate.paymentCount,feeOre:estimate.feeOre,
  payoutOre:estimate.payoutOre,desiredOre,suggested,
  // Deposit is held separately and must never be treated as sale income.
  feeBaseOre:amountOre
 };
}
