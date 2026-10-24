import {invoicePaymentState} from "./invoicePaymentStatus";
import {shiftDateKey} from "./osloTime";

const issued=invoice=>invoice.status!=="draft";
const dateValue=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))?String(value):"";
const differenceDays=(from,to)=>{
 const a=dateValue(from),b=dateValue(to);
 if(!a||!b)return null;
 const utc=date=>Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)));
 return Math.round((utc(b)-utc(a))/86400000);
};

export function invoiceArchiveDueInfo(invoice,today){
 const payment=invoicePaymentState(invoice,today);
 const days=differenceDays(invoice.due_date,today);
 if(payment.outstanding<=0||days===null)return {kind:payment.outstanding<=0?payment.key:"noDate",label:payment.outstanding<=0?payment.label:"Forfallsdato mangler",days:null};
 if(days>0)return {kind:days>=14?"oldOverdue":"overdue",label:days+" "+(days===1?"dag":"dager")+" forfalt",days};
 if(days===0)return {kind:"today",label:"Forfaller i dag",days:0};
 return {kind:"upcoming",label:"Forfaller om "+(-days)+" "+(-days===1?"dag":"dager"),days};
}

export function invoiceArchiveOverview(invoices,today){
 const totals={outstanding:0,overdue:0,paid:0,overdue14:0,dueSoon:0,issuedCount:0,
  unpaidCount:0,overdueCount:0,overdue14Count:0,dueSoonCount:0,partialCount:0,paidCount:0,creditedCount:0};
 const cutoff14=shiftDateKey(today,-14),forward7=shiftDateKey(today,7);
 for(const invoice of invoices||[]){
  if(!issued(invoice))continue;
  const payment=invoicePaymentState(invoice,today),due=dateValue(invoice.due_date);
  totals.issuedCount++;
  totals.outstanding+=payment.outstanding;
  totals.paid+=payment.paid;
  if(payment.outstanding===0){if(payment.key==="credited")totals.creditedCount++;else totals.paidCount++;continue;}
  totals.unpaidCount++;
  if(payment.paid>0)totals.partialCount++;
  if(due&&due<today){
   totals.overdue+=payment.outstanding;totals.overdueCount++;
   if(due<=cutoff14){totals.overdue14+=payment.outstanding;totals.overdue14Count++;}
  }else if(due&&due>=today&&due<=forward7){
   totals.dueSoon+=payment.outstanding;totals.dueSoonCount++;
  }
 }
 return totals;
}

export function invoiceArchiveVisible(invoices,today,{archiveMode=true,filter="unpaid",query="",sort="priority"}={}){
 const forward7=shiftDateKey(today,7),cutoff14=shiftDateKey(today,-14);
 const find=String(query||"").toLocaleLowerCase("nb-NO").trim();
 const result=(invoices||[]).filter(invoice=>{
  if(archiveMode?!issued(invoice):issued(invoice))return false;
  const payment=invoicePaymentState(invoice,today),due=dateValue(invoice.due_date);
  if(archiveMode){
   switch(filter){
    case "unpaid":if(payment.outstanding<=0)return false;break;
    case "overdue":if(payment.outstanding<=0||!due||due>=today)return false;break;
    case "overdue14":if(payment.outstanding<=0||!due||due>cutoff14)return false;break;
    case "dueSoon":if(payment.outstanding<=0||!due||due<today||due>forward7)return false;break;
    case "partial":if(payment.paid<=0||payment.outstanding<=0)return false;break;
    case "paid":if(payment.key!=="paid")return false;break;
    case "credited":if(payment.key!=="credited")return false;break;
    case "all":break;
    default:return false;
   }
  }
  if(!find)return true;
  const customer=invoice.customer||{};
  const haystack=[invoice.invoice_number,invoice.title,customer.name,customer.email,customer.address,customer.phone]
   .map(x=>String(x??"")).join(" ").toLocaleLowerCase("nb-NO");
  return haystack.includes(find);
 });
 const newest=(a,b)=>String(b.issued_at||b.created_at||"").localeCompare(String(a.issued_at||a.created_at||""));
 const byDue=(a,b)=>String(a.due_date||"9999-12-31").localeCompare(String(b.due_date||"9999-12-31"));
 const tie=(a,b)=>newest(a,b)||String(a.id||"").localeCompare(String(b.id||""));
 return result.sort((a,b)=>{
  if(!archiveMode)return newest(a,b)||tie(a,b);
  if(sort==="newest")return tie(a,b);
  if(sort==="due")return byDue(a,b)||tie(a,b);
  if(sort==="amount")return invoicePaymentState(b,today).outstanding-invoicePaymentState(a,today).outstanding||tie(a,b);
  // Follow-up priority: unsettled balances first; older overdue invoices
  // before upcoming ones; paid invoices at the end of the full archive.
  const pa=invoicePaymentState(a,today),pb=invoicePaymentState(b,today);
  if((pa.outstanding>0)!==(pb.outstanding>0))return pa.outstanding>0?-1:1;
  if(pa.outstanding>0&&pb.outstanding>0)return byDue(a,b)||tie(a,b);
  return tie(a,b);
 });
}
