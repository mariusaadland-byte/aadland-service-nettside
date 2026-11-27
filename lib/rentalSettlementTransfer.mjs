import {createHash} from "node:crypto";
import {rentalReportDay} from "./rentalVippsReports.mjs";
import {payoutFromReport} from "./rentalBankReview.mjs";
const pos=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const day=d=>typeof d==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
const hash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
// Trusted input only. Account IDs must be verified in the correct company.
// Clearing account MUST be the account used by rental payment registrations.
export function rentalSettlementPlan({row,kind,psp,bank,companyId,accounts,approved,clearingReconciled,historyComplete}){
 if(approved!==true||clearingReconciled!==true||historyComplete!==true||!pos(companyId)||!["fee","payout"].includes(kind)||typeof psp!=="string"||!psp.trim()||psp.length>120||!row||!day(row.report_date)||!/^\d{4,20}$/.test(row.msn)||!/^[A-Za-z0-9_-]{1,80}$/.test(row.ledger_id))return null;
 const d=rentalReportDay(row.report_date,row.funds,row.fees);if(!d||d.fingerprint!==row.fingerprint)return null;
 const clear=accounts?.clearing, target=kind==="fee"?accounts?.fee:accounts?.bank;
 if(!pos(clear)||!pos(target)||clear===target)return null;
 let amount,date=row.report_date,proof=null;
 if(kind==="fee"){
  const fs=d.funds.filter(e=>e.type==="fees-retained"&&e.pspReference===psp),gs=d.fees.filter(e=>e.type==="fees-retained"&&e.pspReference===psp);
  if(fs.length!==1||gs.length!==1||!pos(-fs[0].amountOre)||gs[0].amountOre!==-fs[0].amountOre||!Number.isSafeInteger(fs[0].balanceBefore)||!Number.isSafeInteger(fs[0].balanceAfter)||fs[0].balanceBefore+fs[0].amountOre!==fs[0].balanceAfter)return null;
  amount=-fs[0].amountOre;
 }else{
  const p=payoutFromReport(row,psp);
  if(!p||bank?.payout_psp!==psp||bank.report_date!==row.report_date||bank.report_digest!==row.fingerprint||bank.msn!==row.msn||bank.ledger_id!==row.ledger_id||bank.amount_ore!==p.amountOre||!hash(bank.proof_digest)||!day(bank.bank_date)||bank.bank_date<row.report_date)return null;
  amount=p.amountOre;date=bank.bank_date;proof=bank.proof_digest;
 }
 // Distinct from service ASVF/ASVP and stable across company/account changes.
 const marker="AU-"+(kind==="fee"?"VF":"VP")+"-"+sha([row.msn,row.ledger_id,psp]).slice(0,40);
 const digest=sha(["rental-settlement-v1",kind,psp,row.report_date,row.fingerprint,row.msn,row.ledger_id,companyId,clear,target,amount,date,proof,marker]);
 return {kind,psp,reportDate:row.report_date,reportDigest:row.fingerprint,msn:row.msn,ledgerId:row.ledger_id,companyId,clear,target,amountOre:amount,date,proof,digest,marker,body:{date,description:"Vipps "+marker,postings:[{row:1,date,amountGross:amount/100,amountGrossCurrency:amount/100,account:{id:target},vatType:{id:0}},{row:2,date,amountGross:-amount/100,amountGrossCurrency:-amount/100,account:{id:clear},vatType:{id:0}}]}};
}
const ore=n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(Math.round(n*100)/100-n)<1e-7?Math.round(n*100):null;
export function rentalVoucherMatches(v,p,id){
 if(!pos(id)||v?.id!==id||v.description!==p.body.description||v.date!==p.date||!Array.isArray(v.postings)||v.postings.length!==2)return false;
 return p.body.postings.every(x=>v.postings.filter(y=>y.account?.id===x.account.id&&y.date===x.date&&ore(y.amountGross)===ore(x.amountGross)&&ore(y.amountGrossCurrency)===ore(x.amountGrossCurrency)&&y.vatType?.id===0&&!y.customer&&!y.supplier).length===1);
}
// Private future adapter; no production route. Search must include all relevant
// prior postings, including manual ones, and verify actual company/account mapping.
export async function transferRentalSettlement({plan:p,store,provider}){
 if(!p)return {status:"review"};
 const safe=async()=>await provider.companyAndAccountsMatch(p)===true&&await provider.noPriorVoucher(p)===true&&await provider.freshSourceMatches(p)===true;
 if(!await safe())return {status:"review"};
 if(await store.claim(p)!=="claimed")return {status:"review_existing"};
 try{
  if(!await safe())throw Error("changed");
  const id=await provider.create(p.body);
  if(!pos(id)||!rentalVoucherMatches(await provider.read(id),p,id))throw Error("unknown");
  return {status:await store.finish(p,id)==="confirmed"?"confirmed":"review",voucherId:id};
 }catch{try{await store.finish(p,null);}catch{}return {status:"review"};}
}
