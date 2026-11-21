import {invoiceSettlementInfo} from "./invoiceSettlementInfo";
import {shiftDateKey} from "./osloTime";
export function invoiceReviewAlerts(invoices,notices,today){
 const groups=new Map();
 for(const notice of notices){const list=groups.get(notice.invoice_id)||[];list.push(notice);groups.set(notice.invoice_id,list);}
 const result=[];
 for(const invoice of invoices){
  if(!["issued","sent"].includes(invoice.status))continue;
  const payment=invoiceSettlementInfo(invoice,today);
  // Financial mismatches or active Vipps/refunds require human
  // reconciliation, not a misleading overdue debt reminder.
  if(payment.needsReview){
   const explanation=payment.kind==="mismatch"
    ?"Beløpsavvik – avstem kreditnotaer og Vipps før purring"
    :payment.kind==="activeVipps"
     ?"Vipps-betaling pågår – kontroller oppgjør før purring"
     :"Vipps-refusjon – avklar eventuelt restkrav før purring";
   result.push({
    invoiceId:invoice.id,invoiceNumber:invoice.invoice_number,
    customerName:invoice.customer?.name||"Ukjent kunde",
    outstandingOre:payment.outstanding,stage:explanation,
    deadline:invoice.due_date||today,requiresReconciliation:true
   });
   continue;
  }
  if(payment.outstanding<=0)continue;
  const history=groups.get(invoice.id)||[];
  const pending=history.find(x=>x.status!=="sent");
  const sent=history.filter(x=>x.status==="sent").sort((a,b)=>String(b.sent_at).localeCompare(String(a.sent_at)));
  const last=sent[0];let stage,deadline;
  if(pending){stage="Kontroller sendeforsøk";deadline=pending.due_date;}
  else if(last?.kind==="inkasso"&&last.due_date<today){stage="Inkassovarsel utløpt – vurder videre oppfølging";deadline=last.due_date;}
  else if(last?.kind==="purring"&&last.due_date<today){stage="Purrefrist utløpt – vurder inkassovarsel";deadline=last.due_date;}
  else if(!last&&invoice.due_date&&invoice.due_date<=shiftDateKey(today,-14)){stage="Minst 14 dager over forfall – vurder purring";deadline=invoice.due_date;}
  if(stage)result.push({invoiceId:invoice.id,invoiceNumber:invoice.invoice_number,customerName:invoice.customer?.name||"Ukjent kunde",outstandingOre:payment.outstanding,stage,deadline,requiresReconciliation:false});
 }
 return result.sort((a,b)=>String(a.deadline).localeCompare(String(b.deadline))||String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)));
}
export function invoiceReviewEmail(items,today){
 const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
 const date=day=>day?day.split("-").reverse().join("."):"";
 return {subject:"Se over fakturaer – "+items.length+" trenger oppfølging – Aadland Service",
 body:["Hei!","","Disse fakturaene trenger din vurdering per "+date(today)+". Kontroller innbetalinger før du sender purring eller inkassovarsel.","",
 ...items.flatMap(item=>[item.invoiceNumber+" – "+item.customerName,item.stage,(item.requiresReconciliation?"Registrert restbeløp (IKKE avstemt): ":"Gjenstående: ")+money(item.outstandingOre)+" · Betalingsfrist: "+date(item.deadline),"https://aadland-service.no/admin/faktura/arkiv?id="+encodeURIComponent(item.invoiceId),""]),
 "Ved beløpsavvik eller pågående Vipps-behandling skal du kontrollere betalinger og kreditnotaer før du purrer kunden. Et uavstemt restbeløp er ikke et bekreftet krav.",
 "Purring, inkassovarsel og oversendelse til inkasso utføres ikke automatisk. Du velger selv videre oppfølging.",
 "Oversikten bygger på innbetalingene som er registrert på nettsiden. Registrer mottatte betalinger for å oppdatere oversikten.",
 "Du får en oppdatert oversikt daglig så lenge fakturaer trenger oppfølging.","","Aadland Service"].join("\n")};
}
