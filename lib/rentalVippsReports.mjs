import {createHash} from "node:crypto";
const integer=n=>Number.isSafeInteger(n);
const date=d=>typeof d==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
export function rentalReportLedger(ledgers,msn,serviceMsn){
 if(!/^\d{4,20}$/.test(msn)||msn===serviceMsn||!Array.isArray(ledgers))return null;
 const matches=ledgers.filter(x=>x?.currency==="NOK"&&Array.isArray(x.settlesForRecipientHandles)&&x.settlesForRecipientHandles.includes("api:"+msn));
 return matches.length===1&&matches[0].settlesForRecipientHandles.length===1&&/^[A-Za-z0-9_-]{1,80}$/.test(matches[0].ledgerId)?matches[0].ledgerId:null;
}
function canonical(entries,topic,day){
 if(!Array.isArray(entries)||entries.length>10000)return null;
 const result=[];
 for(const e of entries){
  if(e?.topic!==topic||e.date!==day||!integer(e.amountOre)||typeof e.type!=="string"||!e.type||typeof e.reference!=="string"||typeof e.pspReference!=="string")return null;
  result.push({topic,type:e.type,amountOre:e.amountOre,date:day,reference:e.reference,pspReference:e.pspReference,balanceBefore:e.balanceBefore??null,balanceAfter:e.balanceAfter??null,time:e.time??"",row:e.row??null});
 }
 return result;
}
export function rentalReportDay(day,funds,fees){
 if(!date(day))return null;
 const f=canonical(funds,"funds",day),g=canonical(fees,"fees",day);if(!f||!g)return null;
 return {funds:f,fees:g,fingerprint:createHash("sha256").update(JSON.stringify([f,g])).digest("hex")};
}
export function rentalReportPeriod(days,rows,msn){
 if(!Array.isArray(days)||!days.length||days.length>366||days.some((d,i)=>!date(d)||i>0&&days[i-1]>=d)||!Array.isArray(rows)||rows.length>days.length)return null;
 const byDay=new Map(),funds=[],fees=[];
 let ledger=null;
 for(const row of rows){
  if(!days.includes(row.report_date)||byDay.has(row.report_date)||row.msn!==msn||!row.ledger_id||ledger&&ledger!==row.ledger_id||!Number.isFinite(Date.parse(row.checked_at)))return null;
  ledger=row.ledger_id;const rebuilt=rentalReportDay(row.report_date,row.funds,row.fees);
  if(!rebuilt||rebuilt.fingerprint!==row.fingerprint)return null;
  byDay.set(row.report_date,row);funds.push(...rebuilt.funds);fees.push(...rebuilt.fees);
 }
 const missingDays=days.filter(d=>!byDay.has(d)),complete=!missingDays.length;
 if(!complete)return {complete:false,missingDays,totals:null,payouts:[]};
 const knownFunds=new Set(["capture","refund","fees-retained","payout-scheduled","payout-aborted","retained-disputed-capture","returned-disputed-capture","correction","top-up","credit-note"]),knownFees=new Set(["capture-fee","fees-retained","fees-invoiced","correction","credit-note"]);
 const unknown=funds.filter(e=>!knownFunds.has(e.type)).length+fees.filter(e=>!knownFees.has(e.type)).length;
 const sum=(a,t)=>a.filter(e=>e.type===t).reduce((n,e)=>n+e.amountOre,0);
 if(funds.some(e=>e.type==="capture"&&e.amountOre<=0||["refund","payout-scheduled"].includes(e.type)&&e.amountOre>=0))return null;
 const payouts=funds.filter(e=>e.type==="payout-scheduled").map(e=>({date:e.date,reference:e.reference,pspReference:e.pspReference,amountOre:-e.amountOre,bankConfirmed:false}));
 const totals={capturesOre:sum(funds,"capture"),refundsOre:-sum(funds,"refund"),assessedFeeReportOre:sum(fees,"capture-fee"),retainedFeeReportOre:-sum(funds,"fees-retained"),scheduledPayoutOre:-sum(funds,"payout-scheduled"),abortedPayoutReportOre:sum(funds,"payout-aborted"),bankConfirmedOre:null};
 if(Object.values(totals).some(v=>v!==null&&!integer(v)))return null;
 return {complete:true,missingDays,totals,payouts:payouts.slice(0,200),payoutCount:payouts.length,unknown,review:unknown>0||funds.some(e=>!["capture","refund","fees-retained","payout-scheduled"].includes(e.type))||fees.some(e=>e.type!=="capture-fee"),oldestCheck:rows.map(r=>r.checked_at).sort()[0],newestCheck:rows.map(r=>r.checked_at).sort().at(-1)};
}
