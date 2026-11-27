import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
const money=n=>Number.isSafeInteger(n)&&n>=0;
export function rentalFinanceSnapshot(data){
 if(data?.complete!==true||!Array.isArray(data.rows)||data.rows.length>500)return null;
 const totals={grossOre:0,rentalOre:0,salesOre:0,depositReceivedOre:0,depositRefundedOre:0,depositRetainedOre:0,depositUnsettledOre:0,depositMissingOre:0,depositReviewCount:0,feeOre:null,bankPayoutOre:null,invoiceConfirmed:0,paymentConfirmed:0,transferPending:0,transferReview:0,capturedCount:0};
 const rows=[],seen=new Set(),psps=new Set();
 for(const g of data.rows){
  if(!rentalUnitId(g?.id)||seen.has(g.id)||!checkFrozenGroupQuote(g)||!["held","payment_pending","confirmed","fulfilled","released","review"].includes(g.status))return null;
  seen.add(g.id);
  const c=g.claim,d=g.deposit,s=g.settlement,t=g.invoice,p=g.payment;
  const captured=!!c?.captured_at;
  if(c&&(c.group_id!==g.id||c.reference!=="AUG-"+g.id||c.reference!==g.payment_reference||c.amount_ore!==g.payable_ore||captured!==!!c.psp_reference))return null;
  if(captured){
   if(!Number.isFinite(Date.parse(c.captured_at))||psps.has(c.psp_reference)||!["confirmed","fulfilled","review"].includes(g.status))return null;
   psps.add(c.psp_reference);totals.capturedCount++;totals.grossOre+=g.payable_ore;totals.rentalOre+=g.rental_ore;totals.salesOre+=g.sales_ore;
  }else if(["confirmed","fulfilled"].includes(g.status))return null;
  if(d&&(!money(d.amount_ore)||d.amount_ore!==g.deposit_ore||typeof d.documented!=="boolean"))return null;
  if(s&&(![s.deposit_ore,s.refund_ore,s.retained_ore].every(money)||s.deposit_ore!==g.deposit_ore||s.refund_ore+s.retained_ore!==s.deposit_ore))return null;
  let depositStatus=g.deposit_ore===0?"none":d?"received":"missing",openDeposit=null;
  if(d){
   totals.depositReceivedOre+=d.amount_ore;
   if(!d.documented)totals.depositReviewCount++;
   if(s?.closed_at){totals.depositRefundedOre+=s.refund_ore;totals.depositRetainedOre+=s.retained_ore;if(!s.documented)totals.depositReviewCount++;depositStatus=s.documented&&d.documented?"settled":"review";openDeposit=0;}
   else{openDeposit=d.amount_ore;totals.depositUnsettledOre+=d.amount_ore;depositStatus=d.documented?"outstanding":"review";}
  }else if(g.deposit_ore>0&&["payment_pending","confirmed","fulfilled"].includes(g.status)){totals.depositMissingOre+=g.deposit_ore;if(g.status==="fulfilled")totals.depositReviewCount++;}
  if(s?.closed_at&&!d&&g.deposit_ore>0)return null;
  if(t&&(!captured||t.gross_ore!==g.payable_ore||!["claimed","review","confirmed"].includes(t.state)||(t.state==="confirmed")!==Number.isSafeInteger(t.remote_invoice_id)))return null;
  if(p&&(!t||t.state!=="confirmed"||p.remote_invoice_id!==t.remote_invoice_id||p.amount_ore!==g.payable_ore||!["claimed","review","confirmed"].includes(p.state)))return null;
  let transfer="not_started";
  if(t?.state==="confirmed")totals.invoiceConfirmed++;
  if(p?.state==="confirmed"){totals.paymentConfirmed++;transfer="payment_confirmed";}
  else if(t?.state==="review"||p?.state==="review"||t?.state==="claimed"||p?.state==="claimed"){totals.transferReview++;transfer="review";}
  else if(t?.state==="confirmed"){totals.transferPending++;transfer="invoice_confirmed";}
  else if(captured){totals.transferPending++;transfer="pending";}
  rows.push({id:g.id,orderNumber:String(g.order_number),status:g.status,capturedAt:c?.captured_at||null,grossOre:captured?g.payable_ore:null,depositStatus,openDeposit,transfer,feeOre:null});
 }
 if(Object.values(totals).some(n=>n!==null&&!money(n)))return null;
 return {totals,rows};
}
