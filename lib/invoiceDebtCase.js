// Internal, read-only dossier for considering further invoice follow-up.
// This does not authorize debt collection, send a demand or assess fees.
const safeOre=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):null;
export function invoiceDebtCaseReadiness({invoice,reminders=[],payments=[],
 payment,settlement,today}){
 const reasons=[];
 if(!invoice||!["issued","sent"].includes(invoice.status))
  reasons.push("Fakturaen er ikke utstedt.");
 if(!payment||!Number.isSafeInteger(payment.outstanding)||payment.outstanding<=0)
  reasons.push("Det finnes ikke noe bekreftet utestående beløp.");
 if(!/^20\d\d-\d\d-\d\d$/.test(String(today||"")))
  reasons.push("Dagens dato kunne ikke bekreftes.");
 if(!String(invoice?.customer?.name||"").trim())
  reasons.push("Kundens identitet må kontrolleres.");
 const noticeRows=(reminders||[]).filter(n=>n?.kind==="inkasso"&&n.status==="sent"&&
  typeof n.sent_at==="string"&&/^20\d\d-\d\d-\d\d$/.test(String(n.due_date||"")));
 const lastNotice=noticeRows.slice().sort((a,b)=>
  String(b.sent_at).localeCompare(String(a.sent_at)))[0]||null;
 if(!lastNotice)reasons.push("Et bekreftet sendt inkassovarsel er ikke dokumentert.");
 else if(lastNotice.due_date>=today)reasons.push("Betalingsfristen i inkassovarselet er ikke utløpt.");
 if((reminders||[]).some(n=>n.status!=="sent"))
  reasons.push("Det finnes et varsel med ubekreftet sendestatus.");
 if(settlement?.needsReview||!settlement)
  reasons.push("Oppgjør, kreditering, Vipps eller refusjon må avstemmes.");
 const recordedPayments=(payments||[]).reduce((sum,p)=>{
  const amount=safeOre(p.amount_ore);
  return amount===null?NaN:sum+(p.reversed_at?0:amount);
 },0);
 if(!Number.isSafeInteger(recordedPayments)||
  recordedPayments!==safeOre(payment?.paid))
  reasons.push("Innbetalinger i hovedoversikten stemmer ikke sikkert med betalingsloggen.");
 return {readyForManualReview:reasons.length===0,reasons,lastNotice,
  verifiedOutstandingOre:payment?.outstanding||0,
  recordedPaymentsOre:Number.isSafeInteger(recordedPayments)?recordedPayments:null};
}
