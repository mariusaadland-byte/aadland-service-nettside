// Pure payment synchronisation gate. A balanced invoice is a prerequisite,
// never evidence on its own that individual historical payments need replaying.
export const positiveInteger=value=>{
 if(typeof value==="boolean"||value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
export const nonnegativeInteger=value=>{
 const n=Number(value);
 return value!==null&&value!==undefined&&value!==""&&
  Number.isSafeInteger(n)&&n>=0?n:null;
};
export const validPaymentDate=s=>typeof s==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+"T12:00:00Z"))&&
 new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
export function paymentTypeList(result){
 if(!Array.isArray(result?.values))return [];
 return result.values.filter(x=>positiveInteger(x?.id)&&x.isActive!==false&&x.inactive!==true)
  .slice(0,1000).map(x=>({
   id:positiveInteger(x.id),
   label:String(x.name||x.description||("Betalingstype "+x.id)).slice(0,140)
  }));
}
export function paymentReadiness({link,invoice,payments=[],transfers=[],remoteOutstandingOre,
 creditNotes=[],vippsPayments=[]}){
 const blocked=reason=>({ok:false,reason,pending:[],next:null});
 // A direct import of a PREVIOUSLY paid invoice starts with Tripletex
 // outstanding at full gross. This is an import checkpoint, NOT a false
 // statement that the local and remote balances matched.
 // After both balances actually match, the later genuine checkpoint wins.
 const matchedAt=Date.parse(link?.matched_at||"");
 const importAt=Date.parse(link?.initial_import_checkpoint_at||"");
 const useMatched=Number.isFinite(matchedAt)&&
  (!Number.isFinite(importAt)||matchedAt>importAt);
 const baseline=nonnegativeInteger(useMatched?
  link?.matched_outstanding_ore:link?.initial_import_outstanding_ore);
 const baselineAt=useMatched?matchedAt:importAt;
 const gross=nonnegativeInteger(link?.invoice_gross_ore);
 const paid=nonnegativeInteger(invoice?.paid_ore);
 const credits=nonnegativeInteger(invoice?.credited_ore);
 const remote=nonnegativeInteger(remoteOutstandingOre);
 if(invoice?.status!=="sent"||baseline===null||!Number.isFinite(baselineAt)||gross===null||
  paid===null||credits===null||credits!==0||remote===null||remote>gross)
  return blocked("Fakturaen må være sendt, uten kreditering, og ha en tidligere avstemt Tripletex-saldo.");
 if(creditNotes.length||vippsPayments.some(p=>Number(p.refunded_ore)>0||
    ["pending","authorized"].includes(p.state)))
  return blocked("Refusjon, kreditnota eller uavklart Vipps-betaling krever manuell avstemming.");
 if(transfers.some(p=>["processing","needs_review"].includes(p.status)))
  return blocked("En tidligere betaling er uavklart. Kontroller Tripletex før flere overføringer.");
 const active=payments.filter(p=>!p.reversed_at);
 const total=active.reduce((n,p)=>n+Number(p.amount_ore||0),0);
 if(!active.every(p=>positiveInteger(p.amount_ore)&&validPaymentDate(p.paid_on))||
  !Number.isSafeInteger(total)||total!==paid)
  return blocked("Aadland sine innbetalingslinjer stemmer ikke med fakturaens betalte beløp.");
 // A payment recorded before a verified baseline may already be included in
 // the original CSV import. NEVER send historical payments again.
 const after=payments.filter(p=>Date.parse(p.recorded_at||"")>baselineAt);
 if(after.some(p=>p.reversed_at))
  return blocked("En innbetaling er angret etter siste avstemming. Kontroller begge systemene.");
 const afterActive=after.filter(p=>!p.reversed_at)
  .sort((a,b)=>String(a.recorded_at).localeCompare(String(b.recorded_at))||
   String(a.id).localeCompare(String(b.id)));
 const ids=new Set(afterActive.map(x=>x.id));
 // Confirmed payments from BEFORE this balanced checkpoint are historical.
 // Ignore them here; otherwise a fresh baseline would block all future payments.
 const confirmed=transfers.filter(t=>t.status==="confirmed"&&ids.has(t.payment_id));
 if(confirmed.some(t=>!ids.has(t.payment_id)||
  Number(t.amount_ore)!==Number(active.find(p=>p.id===t.payment_id)?.amount_ore)||
  String(t.payment_date)!==String(active.find(p=>p.id===t.payment_id)?.paid_on)))
  return blocked("Registrerte betalingsoverføringer stemmer ikke med de opprinnelige innbetalingene.");
 const sent=confirmed.reduce((sum,t)=>sum+Number(t.amount_ore||0),0);
 const expectedBefore=baseline-sent;
 const localOutstanding=gross-paid;
 if(expectedBefore<0||remote!==expectedBefore)
  return blocked("Tripletex sitt restbeløp er endret utenfor denne overføringen. Kontroller begge systemene.");
 const pending=afterActive.filter(p=>!confirmed.some(t=>t.payment_id===p.id));
 const pendingSum=pending.reduce((sum,p)=>sum+Number(p.amount_ore||0),0);
 if(!Number.isSafeInteger(pendingSum)||pendingSum<0||
   remote-localOutstanding!==pendingSum)
  return blocked("Beløpsdifferansen stemmer ikke nøyaktig med innbetalingene som gjenstår.");
 return {ok:true,reason:null,
  pending:pending.map(p=>({id:p.id,amountOre:Number(p.amount_ore),paidOn:p.paid_on,
   source:p.vipps_reference?"vipps":"bank"})),
  next:pending.length?{id:pending[0].id,amountOre:Number(pending[0].amount_ore),
   paidOn:pending[0].paid_on,source:pending[0].vipps_reference?"vipps":"bank"}:null,
  remoteOutstandingOre:remote,localOutstandingOre:localOutstanding,
  baselineOre:baseline};
}
export function paymentWriteParams(id,paymentDate,paymentTypeId,amountOre){
 const invoiceId=positiveInteger(id),typeId=positiveInteger(paymentTypeId);
 const ore=positiveInteger(amountOre);
 if(!invoiceId||!typeId||!ore||!validPaymentDate(paymentDate))
  throw Error("Ugyldig faktura, betalingstype, dato eller beløp.");
 const amount=(ore/100).toFixed(2);
 return {invoiceId,paymentDate,paymentTypeId:typeId,amountOre:ore,amount};
}
