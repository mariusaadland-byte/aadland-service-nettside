import {rentalReportDay} from "./rentalVippsReports.mjs";
const day=s=>typeof s==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const hash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
export function bankMatchInput(b,today){
 if(!day(b?.reportDate)||!day(b.bankDate)||!day(today)||b.bankDate<b.reportDate||b.bankDate>today||!hash(b.reportDigest)||typeof b.pspReference!=="string"||!b.pspReference.trim()||b.pspReference.length>120||typeof b.bankReference!=="string"||!b.bankReference.trim()||b.bankReference.trim().length>200||!positive(b.amountOre)||b.confirmed!==true)return null;
 return {...b,bankReference:b.bankReference.trim()};
}
export function payoutFromReport(row,psp){
 const d=rentalReportDay(row?.report_date,row?.funds,row?.fees);
 if(!d||d.fingerprint!==row.fingerprint||typeof psp!=="string"||!psp.trim())return null;
 const entries=d.funds.filter(e=>e.type==="payout-scheduled"&&e.pspReference===psp);
 if(entries.length!==1||!positive(-entries[0].amountOre)||d.funds.some(e=>e.type==="payout-aborted"&&(!e.pspReference||e.pspReference===psp)))return null;
 return {date:row.report_date,pspReference:psp,amountOre:-entries[0].amountOre,reportDigest:row.fingerprint};
}
export function bankAndFeeReview(rows,matches){
 if(!Array.isArray(rows)||!Array.isArray(matches))return null;
 const payouts=[],fees=[],psps=new Map(),aborts=new Set(),unknownAbort=rows.some(r=>r.funds.some(e=>e.type==="payout-aborted"&&!e.pspReference));
 for(const r of rows)for(const e of r.funds){if(e.type==="payout-scheduled")psps.set(e.pspReference,(psps.get(e.pspReference)||0)+1);if(e.type==="payout-aborted")aborts.add(e.pspReference);}
 for(const r of rows){
  const d=rentalReportDay(r.report_date,r.funds,r.fees);if(!d||d.fingerprint!==r.fingerprint)return null;
  for(const e of d.funds){
   if(e.type==="payout-scheduled"){
    const q=payoutFromReport(r,e.pspReference),m=matches.find(x=>x.payout_psp===e.pspReference);
    const eligible=!!q&&psps.get(e.pspReference)===1&&!aborts.has(e.pspReference)&&!unknownAbort;
    const matched=eligible&&m&&m.report_date===r.report_date&&m.report_digest===r.fingerprint&&m.amount_ore===q.amountOre&&m.msn===r.msn&&m.ledger_id===r.ledger_id&&hash(m.proof_digest);
    payouts.push({date:r.report_date,pspReference:e.pspReference,amountOre:-e.amountOre,reportDigest:r.fingerprint,status:matched?"attested":m||!eligible?"review":"await_bank",eligible:eligible&&!m,bankDate:matched?m.bank_date:null});
   }
   if(e.type==="fees-retained")fees.push({date:r.report_date,pspReference:e.pspReference,amountOre:-e.amountOre,reportDigest:r.fingerprint,status:"review",readyToPost:false});
  }
 }
 const freq=new Map();for(const x of fees)freq.set(x.pspReference,(freq.get(x.pspReference)||0)+1);
 for(const x of fees)if(x.pspReference&&positive(x.amountOre)&&freq.get(x.pspReference)===1)x.status="candidate";
 const attested=payouts.filter(x=>x.status==="attested");
 return {payouts:payouts.slice(0,200),feeCandidates:fees.slice(0,200),attestedOre:attested.length?attested.reduce((n,x)=>n+x.amountOre,0):null,bankConfirmedOre:null,readyToPost:false};
}
