import {rentalUnitId} from "./rentalUnitQr.mjs";
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function groupAdminRow({group,bookings,agreementId,signed,claim,deposit,report,assignments,returns,settlement,damageCount}){
 if(!rentalUnitId(group?.id)||!["held","payment_pending","confirmed","fulfilled","released","review"].includes(group.status)||![group.payable_ore,group.deposit_ore].every(integer)||!Array.isArray(bookings)||!bookings.length||!Array.isArray(assignments)||!Array.isArray(returns)||!integer(damageCount))return null;
 if(bookings.some(b=>b.group_id!==group.id)||new Set(bookings.map(b=>b.id)).size!==bookings.length)return null;
 if([claim,deposit,report,settlement].some(x=>x&&x.group_id!==group.id)||assignments.some(a=>!bookings.some(b=>b.id===a.booking_id)||a.report_id!==report?.id)||returns.some(r=>r.group_id!==group.id||!bookings.some(b=>b.id===r.booking_id)))return null;
 const captured=!!claim?.captured_at&&!!claim.psp_reference&&claim.amount_ore===group.payable_ore&&claim.reference===group.payment_reference;
 const depositRecorded=group.deposit_ore===0||deposit?.amount_ore===group.deposit_ore;
 const returned=bookings.filter(b=>b.status==="returned").length;
 const received=returns.length,blocked=assignments.filter(a=>!a.released_at&&returns.some(r=>r.booking_id===a.booking_id)).length;
 const settled=!!settlement?.closed_at&&settlement.deposit_ore===group.deposit_ore&&integer(settlement.refund_ore)&&integer(settlement.retained_ore)&&settlement.refund_ore+settlement.retained_ore===group.deposit_ore;
 let phase=group.status==="released"?"cancelled":group.status==="review"?"review":group.status==="held"?(signed?"payment":"signing"):group.status==="payment_pending"?"payment":group.status==="confirmed"?"handover":settled&&returned===bookings.length&&blocked===0?"closed":received===bookings.length?"settlement":"return";
 if(["confirmed","fulfilled"].includes(group.status)&&(!captured||!signed))phase="review";
 if(group.status==="fulfilled"&&(!report||assignments.length!==bookings.length))phase="review";
 if(blocked>0&&phase!=="review")phase="inspection";
 return {id:group.id,orderNumber:String(group.order_number),createdAt:group.created_at,phase,groupStatus:group.status,amountOre:group.payable_ore,depositOre:group.deposit_ore,depositRecorded,signed:!!signed,agreementId:agreementId||null,payment:captured?"captured_recorded":claim?"pending":"not_started",reportId:report?.id||null,totalUnits:bookings.length,received,returned,blocked,damageCount,settlement:settlement?{requestId:settlement.request_id||null,refundOre:settlement.refund_ore,retainedOre:settlement.retained_ore,closed:settled}:null,units:bookings.map(b=>({id:b.id,number:b.booking_number,status:b.status,start:b.start_date,end:b.end_date,unitId:assignments.find(a=>a.booking_id===b.id)?.unit_id||null,released:!!assignments.find(a=>a.booking_id===b.id)?.released_at,condition:returns.find(r=>r.booking_id===b.id)?.condition||null}))};
}
