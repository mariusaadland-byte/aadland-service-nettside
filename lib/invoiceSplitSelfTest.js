// Fixed, fake financial records for owner-only testing.
// These must never be written to invoice_drafts or assigned invoice numbers.
const addDays=(date,days)=>{
 const d=new Date(date+"T12:00:00Z");
 if(!Number.isFinite(d.getTime()))throw Error("Ugyldig testdato");
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
};
export const SPLIT_SELFTEST_RECIPIENT="post@aadland-service.no";
export function makeSplitSelfTestDocs(today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today||"")))throw Error("Ugyldig testdato");
 const customer={
  name:"Eksempelkunde – TEST, ikke ekte kunde",
  email:"eksempel@example.invalid",
  address:"Eksempelveien 1\n5000 Bergen",
  customerType:"private",
  paymentMethod:"bank",
  workDate:today,
  workDescription:"Fiktivt monteringsarbeid og materialer. Bare teknisk test, ikke levering eller betalingskrav."
 };
 const common={
  demoDocument:true,
  invoice_number:null,
  issued_date:null,
  status:"draft",
  title:"TEST – montering og materialer",
  notes:"TESTDOKUMENT – IKKE BETAL. Ingen faktura er utstedt eller bokført.",
  customer
 };
 return [
  {...common,installment_index:1,installment_percent:40,
   planned_send_on:today,due_date:addDays(today,7),
   line_items:[{description:"DEMO – montering, del 1",quantity:1,unit:"stk",unitPriceOre:320000,vatRate:25}]},
  {...common,installment_index:2,installment_percent:60,
   planned_send_on:addDays(today,21),due_date:addDays(today,35),
   line_items:[{description:"DEMO – montering, del 2",quantity:1,unit:"stk",unitPriceOre:480000,vatRate:25}]}
 ];
}
export function splitSelfTestTotalOre(invoice){
 return (invoice.line_items||[]).reduce((sum,l)=>{
  const net=Math.round(Number(l.quantity)*Number(l.unitPriceOre));
  return sum+net+Math.round(net*Number(l.vatRate)/100);
 },0);
}
export function splitSelfTestEmail(docs,attachments){
 if(!Array.isArray(docs)||docs.length!==2||!Array.isArray(attachments)||attachments.length!==2)
  throw Error("Test krever nøyaktig to delfakturaer");
 if(docs.some(d=>!d.demoDocument||d.invoice_number||d.status!=="draft"))
  throw Error("Bare ugyldige testdokumenter kan sendes fra testsiden");
 if(attachments.some(a=>!/^TEST-Aadland-Service-Del-[12]\.pdf$/.test(a.filename)||
  typeof a.content!=="string"||!a.content))throw Error("Testvedlegg mangler");
 const total=docs.reduce((sum,d)=>sum+splitSelfTestTotalOre(d),0);
 const kroner=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
 return {
  from:"Aadland Service <noreply@aadland-service.no>",
  to:SPLIT_SELFTEST_RECIPIENT,
  replyTo:SPLIT_SELFTEST_RECIPIENT,
  subject:"TEST – deling av faktura i 2 (INGEN BETALING)",
  text:[
   "Dette er en teknisk test fra Aadland Service.","",
   "Ingen reell faktura er utstedt, og dette er IKKE et betalingskrav.",
   "Ingen fakturanummer er tildelt, og ingen regnskapsbilag er opprettet.","",
   "Del 1: 40 % – "+kroner(splitSelfTestTotalOre(docs[0]))+".",
   "Del 2: 60 % – "+kroner(splitSelfTestTotalOre(docs[1]))+".",
   "Totalt eksempelbeløp: "+kroner(total)+".",
   "To tydelig merkede demo-PDF-er er vedlagt, fra den ekte PDF-motoren.","",
   "IKKE BETAL NOE. Denne e-posten sendes bare til firmaets egen testadresse."
  ].join("\n"),
  attachments
 };
}
