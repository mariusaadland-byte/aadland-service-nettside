import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {invoicePaymentState} from "../../../../../lib/invoicePaymentStatus";
import {invoiceSettlementInfo,summarizeInvoiceActivity}
 from "../../../../../lib/invoiceSettlementInfo";
import {invoiceDebtCaseReadiness} from "../../../../../lib/invoiceDebtCase";
import {osloDateKey} from "../../../../../lib/osloTime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=s=>typeof s==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const htmlEscape=s=>String(s??"").replace(/[&<>"']/g,c=>
 ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const date=s=>typeof s==="string"?s.slice(0,10):"";
const text=s=>String(s??"").slice(0,350);
const docLink=(path,title)=>'<a href="'+htmlEscape(path)+'">'+htmlEscape(title)+'</a>';

function printable(d){
 const e=htmlEscape,renderRows=(headers,rows)=>'<table><thead><tr>'+
  headers.map(x=>'<th>'+e(x)+'</th>').join("")+'</tr></thead><tbody>'+
  rows.map(r=>'<tr>'+r.map(cell=>'<td>'+e(cell)+'</td>').join("")+'</tr>').join("")+
  '</tbody></table>';
 const notices=d.reminders.map(n=>[n.kind==="inkasso"?"Inkassovarsel":"Purring",
  n.status==="sent"?"Sendt":"Ikke bekreftet",date(n.sentAt||n.createdAt),date(n.dueDate),
  money(n.outstandingOre)]);
 const payments=d.payments.map(p=>[date(p.paidOn),money(p.amountOre),
  p.reversedAt?"Reversert":"Registrert",p.type]);
 const credits=d.creditNotes.map(c=>[c.number,date(c.date),money(c.amountOre),
  c.sentAt?"E-post registrert sendt":"Utsending ikke bekreftet"]);
 const invoicePdf="/api/admin/invoices/pdf?id="+encodeURIComponent(d.invoiceId)+"&inline=1";
 const noticeLinks=d.reminders.filter(n=>n.status==="sent").map(n=>
  '<li>'+docLink("/api/admin/invoices/reminders?invoiceId="+encodeURIComponent(d.invoiceId)+
   "&documentId="+encodeURIComponent(n.id),
   (n.kind==="inkasso"?"Inkassovarsel":"Purring")+" "+date(n.sentAt))+'</li>').join("");
 const creditLinks=d.creditNotes.map(c=>'<li>'+docLink(
  "/api/admin/invoices/credit-notes?invoiceId="+encodeURIComponent(d.invoiceId)+
  "&documentId="+encodeURIComponent(c.id),"Kreditnota "+c.number)+'</li>').join("");
 const reasons=d.reasons.length?'<p><strong>Krever avklaring:</strong> '+d.reasons.map(e).join("; ")+'</p>':
  '<p>Ingen tekniske avvik i lagret grunnlag. Manuell kontroll av tvist, lovverk og bank kreves fortsatt.</p>';
 return '<!doctype html><html lang="nb"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Internt saksgrunnlag – '+e(d.invoiceNumber)+'</title>'+
  '<style>body{font:15px/1.5 system-ui,Arial,sans-serif;max-width:860px;margin:28px auto;padding:0 16px;color:#19242a}'+
  'h1{font-size:25px}h2{font-size:18px;margin-top:30px}table{width:100%;border-collapse:collapse;font-size:13px}'+
  'td,th{border:1px solid #bac5cf;padding:9px;text-align:left;vertical-align:top}th{background:#f1f3f5}'+
  'a{color:#174c75}small{color:#35475c}.warn{padding:12px;border:2px solid #9c5e18}'+
  '@media print{body{margin:0;max-width:none}a{color:inherit;text-decoration:none}}'+
  '</style></head><body>'+
  '<h1>INTERNT SAKSGRUNNLAG – IKKE BETALINGSOPPFORDRING</h1>'+
  '<p><strong>Faktura: '+e(d.invoiceNumber)+'</strong> · Dato for oversikt: '+e(d.asOf)+'</p>'+
  '<p>Kunde: '+e(d.customerName)+'</p><p>Kravet gjelder: '+e(d.title)+'</p>'+
  '<p>Fakturadato: '+e(d.issuedDate)+' · Opprinnelig forfall: '+e(d.originalDueDate)+'</p>'+
  '<h2>Beløp (uten gebyrer eller renter)</h2>'+
  renderRows(["Fakturabeløp","Kreditert","Innbetalt","Utestående"],
   [[money(d.grossOre),money(d.creditedOre),money(d.paidOre),money(d.outstandingOre)]])+
  '<div class="warn"><strong>Status: '+(d.readyForManualReview?"Klar for manuell vurdering":"Ikke klar")+'</strong>'+
  reasons+'</div>'+
  '<h2>Registrerte innbetalinger</h2>'+
  (payments.length?renderRows(["Dato","Beløp","Status","Type"],payments):'<p>Ingen betalingsposter i historikken.</p>')+
  '<h2>Varsler og frister</h2>'+
  (notices.length?renderRows(["Dokument","Status","Dato","Frist","Beløp ved varsel"],notices):'<p>Ingen varsler.</p>')+
  '<h2>Kreditnotaer</h2>'+
  (credits.length?renderRows(["Nummer","Dato","Beløp","Utsending"],credits):'<p>Ingen kreditnotaer.</p>')+
  '<h2>Originaler og PDF-er</h2><ul><li>'+docLink(invoicePdf,"Original faktura")+
  '</li>'+noticeLinks+creditLinks+'</ul>'+
  '<p><small>Dokumentlenkene krever innlogging som eier. Skriv ut dette arket til PDF og lagre originalene separat ved behov.</small></p>'+
  '<h2>Kontroller før noen videre krav</h2>'+
  '<p>Avstem bank og Tripletex, innsigelser/tvister, kreditering, foreldelse og gjeldende lovregler. '+
  'Ikke bruk dette arket som betalingsoppfordring til kunden. Ingen sending, gebyrberegning eller inkassostart er utført.</p>'+
  '</body></html>';
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eier kan lese saksgrunnlag for egeninnkreving."},403);
 const url=new URL(req.url),id=url.searchParams.get("invoiceId");
 if(!uuid(id))return json({error:"Ugyldig faktura."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const first=await s.from("invoice_drafts").select(
   "id,status,invoice_number,issued_date,issued_at,due_date,title,customer,line_items,paid_ore,credited_ore,sent_at"
  ).eq("id",id).maybeSingle();
  if(first.error||!first.data)return json({error:"Fakturaen finnes ikke."},404);
  const invoice=first.data;
  const [reminders,payments,credits,vipps]=await Promise.all([
   s.from("invoice_reminder_sends").select("id,kind,status,sent_at,created_at,due_date,outstanding_ore")
    .eq("invoice_id",id).order("created_at",{ascending:false}).limit(101),
   s.from("invoice_payments").select("id,amount_ore,paid_on,recorded_at,reversed_at,vipps_reference")
    .eq("invoice_id",id).order("recorded_at",{ascending:false}).limit(501),
   s.from("invoice_credit_notes").select("id,invoice_id,credit_number,credit_date,total_ore,sent_at")
    .eq("invoice_id",id).order("issued_at",{ascending:false}).limit(101),
   s.from("invoice_vipps_payments").select("invoice_id,state,captured_ore,refunded_ore")
    .eq("invoice_id",id).limit(501)
  ]);
  if([reminders,payments,credits,vipps].some(r=>r.error||!Array.isArray(r.data))||
   reminders.data.length>100||payments.data.length>500||
   credits.data.length>100||vipps.data.length>500)
   return json({error:"Hele historikken kunne ikke kontrolleres. Ingen saksoversikt kan godkjennes."},503);
  const current=summarizeInvoiceActivity([invoice],vipps.data,credits.data)[0];
  const today=osloDateKey(new Date());
  const payment=invoicePaymentState(current,today),settlement=invoiceSettlementInfo(current,today);
  const state=invoiceDebtCaseReadiness({invoice,reminders:reminders.data,payments:payments.data,
   payment,settlement,today});
  const dossier={
   invoiceId:invoice.id,invoiceNumber:text(invoice.invoice_number),asOf:today,
   customerName:text(invoice.customer?.name),title:text(invoice.title),
   issuedDate:date(invoice.issued_date||invoice.issued_at),
   originalDueDate:date(invoice.due_date),grossOre:payment.gross,
   creditedOre:payment.credited,paidOre:payment.paid,outstandingOre:payment.outstanding,
   readyForManualReview:state.readyForManualReview,reasons:state.reasons,
   lastNoticeDue:state.lastNotice?.due_date||null,
   payments:payments.data.map(p=>({
    paidOn:date(p.paid_on),amountOre:Number(p.amount_ore),reversedAt:p.reversed_at||null,
    type:p.vipps_reference?"Vipps":"Manuell/bank"})),
   reminders:reminders.data.map(n=>({
    id:n.id,kind:n.kind,status:n.status,sentAt:n.sent_at||null,
    createdAt:n.created_at||null,dueDate:date(n.due_date),
    outstandingOre:Number(n.outstanding_ore)})),
   creditNotes:credits.data.map(n=>({
    id:n.id,number:text(n.credit_number),date:date(n.credit_date),
    amountOre:Number(n.total_ore),sentAt:n.sent_at||null}))
  };
  if(url.searchParams.get("format")==="print"){
   const document=printable(dossier);
   return new NextResponse(document,{headers:{...headers,
    "Content-Type":"text/html; charset=utf-8",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options":"nosniff"}});
  }
  return json({ok:true,dossier});
 }catch(error){
  return json({error:"Saksgrunnlaget kunne ikke hentes. Kontroller fakturaarkivet."},503);
 }
}
