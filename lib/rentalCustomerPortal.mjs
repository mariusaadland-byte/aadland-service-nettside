export function rentalPortalExpired(r,at=Date.now()){
 const deadline=Date.parse(r?.payment_due_at||"");
 return r?.status==="new"&&r?.payment_status==="unpaid"&&!r?.payment_reference&&Number.isFinite(deadline)&&deadline<=at;
}
export function rentalPortalGroup(r,at=Date.now()){
 if(rentalPortalExpired(r,at)||["completed","cancelled"].includes(r?.status))return "history";
 if(r?.status==="returned")return "settlement";
 return "active";
}
export function rentalPortalCanPay(r,enabled,at=Date.now()){
 return enabled===true&&r?.paymentDetailsAvailable===true&&["new","confirmed"].includes(r.status)&&!rentalPortalExpired(r,at)&&Number(r.total_ore)>=100&&!["authorized","paid","refunded"].includes(String(r.payment_status||"unpaid").toLowerCase())&&!(Number(r.payment_captured_ore)>Number(r.payment_refunded_ore||0));
}
export function rentalPortalOverdue(r,today){
 return r?.status==="active"&&!!r.end_date&&r.end_date<today;
}
export function rentalPortalDeposit(r){
 const held=Math.max(0,Number(r?.deposit_held_ore)||0),used=Math.max(0,Number(r?.deposit_charged_ore)||0);
 return {held,used,rest:Math.max(0,held-used),closed:Boolean(r?.deposit_released_at)};
}
