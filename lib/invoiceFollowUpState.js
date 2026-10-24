import {invoiceSettlementInfo} from "./invoiceSettlementInfo";

// An admin worklist status, never a legal change to an issued invoice.
// Payment/refund ledger remains authoritative and nothing is automatically closed.
const dateKey=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))?String(value):"";
const dayDifference=(start,end)=>{
 const parse=day=>Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7))-1,Number(day.slice(8,10)));
 return Math.round((parse(end)-parse(start))/86400000);
};
export function invoiceFollowUpState(invoice,today){
 const p=invoiceSettlementInfo(invoice,today);
 if(invoice.status==="draft")return {key:"draft",label:"Kladd",detail:"Ikke utstedt.",requiresAction:false};
 if(p.needsReview)return {key:"review",label:"Må kontrolleres",detail:p.guidance||
  "Kontroller betalingshistorikken før fakturaen følges opp.",requiresAction:true,
  href:"#invoice-settlement"};
 if(p.outstanding===0){
  if(p.gross<=0)return {key:"review",label:"Kontroller nullbeløp",
   detail:"Fakturaen har ikke et positivt opprinnelig beløp. Kontroller grunnlaget før avslutning.",
   requiresAction:true,href:"#invoice-settlement"};
  return {key:"ready",label:"Klar for avslutning",
   detail:p.credited>0?"Fakturaen er økonomisk oppgjort etter registrerte innbetalinger/kreditnotaer. Kontroller dokumentene før den avsluttes administrativt.":
   "Hele fakturabeløpet er registrert oppgjort. Kontroller betalingshistorikken før administrativ avslutning.",
   requiresAction:false,href:"#invoice-settlement"};
 }
 const due=dateKey(invoice.due_date),current=dateKey(today);
 if(!due||!current)return {key:"review",label:"Kontroller forfallsdato",
  detail:"Utestående krav mangler en gyldig forfallsdato. Kontroller fakturaen før betalingsoppfølging.",
  requiresAction:true,href:"#invoice-payment-actions"};
 const days=dayDifference(due,current);
 if(days>0)return {key:"overdue",label:days>=14?"Minst 14 dager forfalt":"Forfalt",
  detail:(p.paid>0?"Delbetaling registrert. ":"")+
   "Kunden har et utestående beløp "+days+" "+(days===1?"dag":"dager")+" etter forfall. Kontroller innbetalinger og vurder riktig purring.",
  requiresAction:true,href:"#invoice-reminder-actions",daysOverdue:days};
 if(days===0)return {key:"dueToday",label:"Forfaller i dag",
  detail:"Betalingsfristen er i dag. Kontroller nye innbetalinger før videre oppfølging.",
  requiresAction:false,href:"#invoice-payment-actions"};
 if(days>=-7)return {key:"dueSoon",label:"Forfaller snart",
  detail:"Forfall er om "+(-days)+" "+(-days===-1?"dag":"dager")+
   ". Avvent betalingsfristen og kontroller bank/Vipps.",
  requiresAction:false,href:"#invoice-payment-actions"};
 return {key:"waiting",label:p.paid>0?"Venter på restbetaling":"Venter på betaling",
  detail:"Fakturaen er ikke forfalt. Kontroller innbetalinger etter hvert som de kommer.",
  requiresAction:false,href:"#invoice-payment-actions"};
}

export function invoiceFollowUpSummary(invoices,today){
 const counts={readyCount:0,reviewCount:0,overdueCount:0,dueSoonCount:0,waitingCount:0,actionCount:0,
  actionOutstandingOre:0,readyGrossOre:0,notDueCount:0};
 for(const invoice of invoices||[]){
  if(invoice.status==="draft")continue;
  const follow=invoiceFollowUpState(invoice,today);
  const payment=invoiceSettlementInfo(invoice,today);
  if(follow.key==="ready"){counts.readyCount++;counts.readyGrossOre+=payment.gross;continue;}
  if(follow.key==="review"){counts.reviewCount++;}
  if(follow.key==="overdue"){counts.overdueCount++;}
  if(follow.key==="dueSoon"||follow.key==="dueToday"){counts.dueSoonCount++;}
  if(follow.key==="waiting"){counts.waitingCount++;}
  if(follow.requiresAction){
   counts.actionCount++;counts.actionOutstandingOre+=payment.outstanding;
  }else counts.notDueCount++;
 }
 return counts;
}
