// Display eligibility only; each server action revalidates committed state.
export function orderActions(row){
 if(!row||["review","cancelled","closed","signing"].includes(row.phase))return [];
 const result=[];
 if(row.signed&&["payment_pending","confirmed"].includes(row.groupStatus)){
  if(!row.depositRecorded&&row.depositOre>0)result.push("deposit");
  if(row.depositRecorded&&!row.reportId)result.push("prepare");
  if(row.reportId&&row.payment==="pending")result.push("capture");
  if(row.reportId&&row.payment==="captured_recorded")result.push("handover");
 }
 if(row.groupStatus==="fulfilled"){
  if(row.units.some(u=>u.unitId&&!u.condition&&u.status==="active"))result.push("receive");
  if(row.units.some(u=>u.unitId&&u.condition&&u.condition!=="ok"&&!u.released))result.push("resolve");
  if(row.returned===row.totalUnits&&row.blocked===0&&!row.settlement&&!row.damageCount&&row.units.every(u=>u.condition==="ok"&&u.released))result.push("plan");
  if(row.settlement&&!row.settlement.closed&&row.settlement.requestId)result.push("record_refund");
 }
 return result;
}
export const actionLabels={deposit:"Registrer mottatt depositum",prepare:"Klargjør utlevering",capture:"Kontrollert Vipps-trekk",handover:"Bekreft fysisk utlevering",receive:"Registrer retur",resolve:"Frigjør etter ny kontroll",plan:"Godkjenn tilbakebetalingsplan",record_refund:"Registrer utført tilbakebetaling"};
export const actionSuccess={deposit:["recorded","existing"],prepare:["prepared","existing"],capture:["confirmed"],handover:["fulfilled","existing"],receive:["received","existing"],resolve:["resolved","existing"],plan:["planned","existing"],record_refund:["closed","existing"]};
