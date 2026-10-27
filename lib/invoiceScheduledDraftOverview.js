// Read-only overview: never issues an invoice, claims a cron job or sends email.
const isDay=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 !Number.isNaN(Date.parse(value+"T00:00:00Z"))&&
 new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
export function scheduledInvoiceStatus(invoice,today,firstInvoice=null){
 if(invoice?.status!=="draft"||invoice?.split_part!==2||
  !invoice?.automatic_send)return null;
 const state=invoice.auto_send_state;
 if(state==="needs_review")return {kind:"review",priority:0,label:"Stoppet – må kontrolleres"};
 if(state==="processing")return {kind:"processing",priority:1,label:"Automatisk sending behandles"};
 if(state!=="scheduled")return null;
 const planned=invoice.planned_send_on;
 if(!isDay(planned)||!isDay(today))return {kind:"invalidDate",priority:0,label:"Manglende eller ugyldig sendingsdato – kontroller"};
 if(planned<today)return {kind:"overdue",priority:0,label:"Sendingsdato passert – ingen bekreftet automatisk sending"};
 const firstSent=firstInvoice?.id===invoice.split_group_id&&firstInvoice.status==="sent"&&Boolean(firstInvoice.sent_at);
 if(planned===today)return firstSent?
  {kind:"today",priority:2,label:"Planlagt for i dag – venter på daglig kjøring"}:
  {kind:"firstMissing",priority:1,label:"Sendingsdato i dag – del 1 mangler bekreftet e-postsending"};
 return firstSent?
  {kind:"upcoming",priority:3,label:"Planlagt automatisk sending"}:
  {kind:"firstMissing",priority:3,label:"Planlagt – del 1 må være sendt før datoen"};
}
export function scheduledInvoiceDraftOverview(invoices,today){
 const rows=(invoices||[]).filter(x=>x?.status==="draft"&&x?.split_part===2&&
  x.automatic_send&&["scheduled","processing","needs_review"].includes(x.auto_send_state));
 const byId=new Map((invoices||[]).map(x=>[x.id,x]));
 const counts={scheduled:0,overdue:0,today:0,firstMissing:0,review:0,processing:0,invalidDate:0};
 const details=rows.map(invoice=>{
  const state=scheduledInvoiceStatus(invoice,today,byId.get(invoice.split_group_id));
  if(invoice.auto_send_state==="scheduled")counts.scheduled++;
  if(state?.kind==="overdue")counts.overdue++;
  if(state?.kind==="today")counts.today++;
  if(state?.kind==="firstMissing")counts.firstMissing++;
  if(state?.kind==="review")counts.review++;
  if(state?.kind==="processing")counts.processing++;
  if(state?.kind==="invalidDate")counts.invalidDate++;
  return {id:invoice.id,...state};
 });
 const nextDate=rows.filter(x=>x.auto_send_state==="scheduled"&&isDay(x.planned_send_on)&&
  x.planned_send_on>=today).map(x=>x.planned_send_on).sort()[0]||null;
 return {...counts,total:rows.length,nextDate,details};
}
export function prioritizeInvoiceDrafts(invoices,today,allInvoices=invoices){
 const byId=new Map((allInvoices||[]).map(x=>[x.id,x]));
 return [...(invoices||[])].sort((a,b)=>{
  const aStatus=scheduledInvoiceStatus(a,today,byId.get(a.split_group_id));
  const bStatus=scheduledInvoiceStatus(b,today,byId.get(b.split_group_id));
  const aPriority=aStatus?.priority??4,bPriority=bStatus?.priority??4;
  if(aPriority!==bPriority)return aPriority-bPriority;
  if(aPriority<4){
   const da=a.planned_send_on||"9999-12-31",db=b.planned_send_on||"9999-12-31";
   if(da!==db)return da.localeCompare(db);
  }
  return 0; // Stable sort preserves the existing newest-first ordering.
 });
}
