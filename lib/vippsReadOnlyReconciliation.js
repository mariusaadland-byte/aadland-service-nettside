// Read-only matching of Tripletex customer open postings to cached Vipps reports.
// No journal entries are created, and matching balances do not close open postings.
const safeOre=value=>{
 if(typeof value!=="number"||!Number.isFinite(value)||
  Math.abs(value)>90071992547409)return null;
 const cents=Math.round(value*100);
 return Number.isSafeInteger(cents)&&Math.abs(value*100-cents)<0.00001?cents:null;
};
const safeId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
export function tripletexOpenBalance(posts,accountId,customerId,through){
 if(!Array.isArray(posts)||posts.length>=1000||!safeId(accountId)||
  !safeId(customerId)||typeof through!=="string")
  throw Error("Tripletex returnerte ikke en fullstendig liste over åpne poster.");
 let sum=0;
 const rows=[];
 const seen=new Set();
 for(const post of posts){
  const id=Number(post?.id);
  const ore=safeOre(post?.amountGross);
  if(!safeId(id)||seen.has(id)||ore===null||
   Number(post?.account?.id)!==Number(accountId)||
   Number(post?.customer?.id)!==Number(customerId)||
   typeof post?.date!=="string"||post.date>through)
   throw Error("En Tripletex-post har uklart beløp, kunde eller konto. Manuell kontroll kreves.");
  seen.add(id);sum+=ore;
  if(!Number.isSafeInteger(sum))throw Error("Tripletex-saldo er utenfor gyldig område.");
  rows.push({id,date:post.date,amountOre:ore,
   voucherId:safeId(post.voucher?.id)?Number(post.voucher.id):null,
   description:String(post.description||"").slice(0,120)});
 }
 return {balanceOre:sum,rows};
}
const key=row=>row.date+"|"+row.pspReference;
export function vippsReconciliationOverview({funds,fees,payouts,
 balanceOre,complete,unknownEntryTypes=0}){
 if(!Array.isArray(funds)||!Array.isArray(fees)||!Array.isArray(payouts)||
  !Number.isSafeInteger(balanceOre))
  throw Error("Avstemmingsgrunnlaget mangler.");
 const latest=funds.length?funds.at(-1):null;
 const vippsBalanceOre=latest&&Number.isSafeInteger(latest.balanceAfter)?
  latest.balanceAfter:null;
 const summarize=(entries,claims,sign)=>entries.map(entry=>{
  const amountOre=sign*entry.amountOre;
  const claim=claims.find(x=>key(x)===key(entry));
  const mismatch=!!claim&&Number(claim.amount_ore??claim.payout_ore)!==amountOre;
  const status=!entry.pspReference||!Number.isSafeInteger(amountOre)||amountOre<=0?
    "review":mismatch?"review":!claim?"missing":
    claim.status==="confirmed"?"confirmed":"review";
  return {date:entry.date,reference:entry.pspReference||"",
   amountOre,status,voucherId:claim?.tripletex_voucher_id||null};
 });
 const retained=summarize(funds.filter(x=>x.type==="fees-retained"&&x.amountOre<0),fees,-1);
 const planned=summarize(funds.filter(x=>x.type==="payout-scheduled"&&x.amountOre<0),payouts,-1);
 const correctionCount=funds.filter(x=>
  (x.type==="fees-retained"||x.type==="payout-scheduled")&&x.amountOre>=0).length;
 const all=[...retained,...planned];
 const unbooked=all.filter(x=>x.status==="missing").length;
 const review=all.filter(x=>x.status==="review").length+correctionCount;
 const differenceOre=vippsBalanceOre===null?null:balanceOre-vippsBalanceOre;
 const balancesMatch=differenceOre===0;
 // Important: matching totals is a balance check, not an instruction to close posts.
 const issues=[];
 if(!complete)issues.push("Ikke alle dager i valgt periode er lagret fra Vipps.");
 if(vippsBalanceOre===null)issues.push("Ingen dokumentert Vipps-sluttsaldo i valgt periode.");
 if(unknownEntryTypes)issues.push("Vipps har ukjente posttyper som må vurderes.");
 if(differenceOre!==null&&!balancesMatch)issues.push("Saldo hos Tripletex er ulik Vipps.");
 if(unbooked)issues.push(unbooked+" gebyrer/utbetalinger mangler registrert overføring.");
 if(review)issues.push(review+" gebyrer/utbetalinger trenger manuell kontroll.");
 return {status:issues.length?"review":"balance_matches",balancesMatch,
  vippsBalanceOre,tripletexBalanceOre:balanceOre,differenceOre,
  vippsLastActivityDate:latest?.date||null,fees:retained,payouts:planned,
  confirmedCount:all.filter(x=>x.status==="confirmed").length,
  missingCount:unbooked,reviewCount:review,issues,
  disclaimer:"Saldokontroll er ikke bankavstemming eller lukking av åpne poster. "+
  "Kontroller betalingskoblinger, refusjoner, bank og enkeltposteringer separat."};
}
